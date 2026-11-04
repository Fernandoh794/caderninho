# Caderninho — design do MVP

Data: 2026-11-04 · Status: aguardando revisão

## 1. Objetivo

Bot de WhatsApp de uso pessoal que descobre as compras novas nos cartões de crédito (BB, Inter e Mercado Pago), pergunta de quem é cada uma e, no fechamento de cada fatura, informa quanto cada pessoa (você, mãe, irmão, irmã) deve pagar.

Sucesso: toda compra de crédito termina com um dono (ou uma divisão) confirmado por você, e cada fechamento de fatura produz o total por pessoa sem conta manual.

## 2. Escopo

### Dentro do MVP
- Fontes: somente compras no **cartão de crédito** (BB, Inter, Mercado Pago). Pix, débito e transferências são ignorados.
- Uso por **uma única pessoa**, em conversa privada; o bot ignora qualquer outro número.
- Uma mensagem por compra nova; resposta por **texto ou áudio**.
- Divisão por percentual ("irmã 50%", "mãe 30, eu 70").
- Sugestão do último dono do mesmo estabelecimento, confirmada com "sim/não".
- Parcelas herdam dono e divisão da primeira parcela classificada, sem avisar.
- Pendências: lembrete diário e aviso no fechamento da fatura antes de calcular os totais.
- Fechamento **por fatura**: total por pessoa daquela fatura.

### Fora do MVP (registrado para depois)
- Cofrinhos do Mercado Pago (listagem e aviso diário de rendimento: "seu cofrinho do (banco) rendeu hoje X, saldo Y") e metas.
- Dívidas fora do cartão (empréstimos avulsos).
- Pix, débito e transferências.
- Outras pessoas recebendo o próprio resumo; grupo da família.
- Atribuição automática por regra (N classificações iguais).
- Saldo corrente por pessoa e abatimento de pagamentos.

## 3. Stack

Node.js 22.13+ (ESM), `node:sqlite`, `node:test`, `fetch` nativo (sem SDKs). Bibliotecas: `@whiskeysockets/baileys`, `pino`, `qrcode-terminal`. Serviços: Pluggy (Meu Pluggy), Groq (Whisper), DeepSeek. Hospedagem: uma VM Oracle Always Free (Ubuntu) com systemd e journald; deploy por GitHub Actions com chave SSH restrita ao script de atualização. O bot antigo na VM será desligado; este é o único serviço.

## 4. Arquitetura

Um processo Node, um SQLite, um unit systemd. Padrão **ports and adapters**: o núcleo define contratos e nunca conhece serviços externos.

| Porta | Contrato | Adaptador do MVP |
|---|---|---|
| `FonteDeCompras` | devolve cartões e compras no formato interno | `pluggy/` |
| `Transcritor` | áudio → texto | `groq/` |
| `Interpretador` | texto livre → atribuição | `deepseek/` |
| `Mensageiro` | recebe e envia mensagens | `baileys/` |

Cada porta tem também um **adaptador falso** em memória para testes. Nenhum outro adaptador será construído no MVP, apenas o contrato.

Módulos: `whatsapp/` (Baileys, filtro por número), `pluggy/`, `transcricao/`, `interpretacao/` (parser rígido + fallback), `nucleo/` (regras puras, sem rede), `jobs/` (agendador), `db/` (SQLite e migrações).

A normalização é responsabilidade do adaptador. O sinal do valor (na Pluggy a compra de cartão é positiva) e o formato de parcelas de cada banco ficam em `pluggy/`; o núcleo só vê o formato interno de `compra`.

### Fluxo
1. Job de sync (a cada 2 horas) pede as compras novas à `FonteDeCompras`.
2. O núcleo verifica se a compra é parcela de um grupo já classificado; se sim, herda dono e divisão. Se a heurística não tiver certeza, trata como compra nova.
3. Compras novas viram **pendentes**; o bot pergunta uma a uma, com a sugestão do último dono do estabelecimento quando houver.
4. A resposta (texto, ou áudio transcrito) passa pelo parser rígido; se falhar, o `Interpretador` tenta, e o resultado é **sempre confirmado** antes de gravar.
5. No fechamento de cada cartão, havendo pendências, o bot avisa; sem pendências, envia o total por pessoa da fatura.

## 5. Modelo de dados

Dinheiro em **centavos** (inteiro); percentuais em **pontos-base** (10000 = 100%); datas ISO. A sobra de arredondamento de uma divisão vai para "eu", de modo que a soma sempre bate com a compra.

- `pessoas`: nome e apelidos aceitos ("mamãe", "mana"). "Eu" é uma pessoa como as outras.
- `cartoes`: banco, apelido, `pluggy_account_id`, dia de fechamento.
- `compras`: `pluggy_transaction_id` **único** (sync idempotente), cartão, descrição original, `estabelecimento_norm`, valor, data, parcela atual, total de parcelas, valor total, `grupo_parcelas_id`, fatura de referência (`AAAA-MM`), status (`pendente`, `classificada`, `ignorada`).
- `atribuicoes`: compra, pessoa, percentual; a soma por compra é sempre 10000.
- `faturas`: cartão, mês de referência, fechada, resumo enviado.
- `perguntas`: compra e id da mensagem do WhatsApp, para ligar a resposta à compra.
- `estado`: vencimento do consentimento da Pluggy, último sync, sessão do Baileys.

A sugestão por estabelecimento não tem tabela: é uma consulta ao último dono classificado do mesmo `estabelecimento_norm`.

### Ligação entre resposta e compra
1. Se você usa "responder" na mensagem do bot, a ligação é exata, pelo id da mensagem.
2. Caso contrário, vale a **pergunta mais recente ainda aberta**, e o bot repete a compra na confirmação ("Netflix, R$ 55,90 → mãe 100%. Confirma?").

### Parcelas
A Open Finance não devolve identificador que ligue as parcelas de uma compra. A primeira parcela classificada define o `grupo_parcelas_id`; as seguintes entram no grupo quando batem estabelecimento, valor total e número de parcela esperado. Se a heurística falhar, a parcela vira pendente normal. Alguns bancos só exibem a parcela no fechamento da fatura, fora da janela de 7 dias do sync; o sync deve cobrir isso.

## 6. Interpretação das respostas

Parser rígido primeiro (nomes e apelidos cadastrados, percentuais, "sim/não"); o DeepSeek só entra se o parser não entender, e seu resultado é sempre confirmado. Áudio: Groq transcreve para texto e o texto segue o mesmo caminho. Para o DeepSeek vai apenas o texto da resposta e o nome do estabelecimento.

## 7. Falhas

- **Pluggy fora ou no limite de chamadas:** nova tentativa com espera crescente; após 3 falhas seguidas, um único aviso; segue tentando nos ciclos seguintes.
- **Consentimento Open Finance (expira em 12 meses):** aviso 30 dias antes, e de novo se o sync falhar por autorização.
- **Groq falhou:** "não consegui ouvir, manda por texto"; a pergunta continua aberta.
- **DeepSeek falhou ou ambíguo:** nada é gravado; o bot mostra exemplos do formato.
- **Baileys caiu:** reconexão automática; se deslogar, novo pareamento por QR via SSH; `HEARTBEAT_URL` opcional avisa quando o bot estiver fora.

### Carga inicial
A Pluggy traz 12 meses de histórico. Na primeira conexão, só as compras da **fatura aberta de cada cartão** viram pendentes; o restante entra como `ignorada`, servindo apenas para sugerir donos de estabelecimentos. As perguntas saem em ritmo controlado (no máximo 5 por vez).

## 8. Segurança

- Só o seu número é atendido; os demais são ignorados sem resposta.
- Chaves (Pluggy, Groq, DeepSeek) em `EnvironmentFile` do systemd com permissão 600, nunca no repositório. O pino redige segredos e não registra conteúdo de áudio.
- Backup diário do SQLite criptografado com GPG, incluído no plano de deploy.
- Deploy por GitHub Actions, com chave SSH restrita ao script de atualização.

## 9. Testes (`node:test`)

- Núcleo puro: divisão e arredondamento (a soma sempre bate), herança de parcelas com fixtures anonimizadas, sugestão por estabelecimento, fechamento com pendências.
- Parser rígido: testes em tabela com frases em português.
- Teste de contrato executado contra cada adaptador de cada porta; adaptadores falsos permitem rodar a suíte inteira offline.

## 10. Riscos e validação inicial (spike)

Antes do restante, validar com a conta real:
1. Se a Pluggy (Meu Pluggy) tem conector estável para **cartão de crédito** de BB, Inter e Mercado Pago.
2. Como cada banco devolve parcelas (campos `installmentNumber`, `totalInstallments`, `totalAmount`).
3. Os limites mensais de chamadas por instituição e a frequência de sync viável.
4. Os termos do Meu Pluggy para uso pessoal contínuo (a fonte consultada não é oficial).

Se um banco não for coberto, o contrato `FonteDeCompras` permite um adaptador de importação de fatura (CSV/OFX) como plano B, que seria o primeiro adaptador pós-MVP.

## 11. Processo

O repositório usará o Spec Kit (`spec.md`, `plan.md`, `tasks.md` em `specs/`, constituição em `.specify/memory/constitution.md`). Os subsistemas seguem a ordem: ingestão → classificação → fechamento; cada um com seu ciclo.
