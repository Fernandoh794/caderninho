# Caderninho — design do MVP

Data: 2026-11-04 · Status: aguardando revisão

## 1. Objetivo

Bot de WhatsApp de uso pessoal para organizar as finanças de uma pessoa que também paga contas de outras. Ele:

1. descobre as compras novas nos cartões de crédito (BB, Inter e Mercado Pago), pergunta de quem é cada uma e, no fechamento de cada fatura, informa quanto cada pessoa (você, mãe, irmão, irmã) deve pagar;
2. acompanha as contas correntes (Pix, débito, entradas), categoriza cada movimentação e mostra para onde o dinheiro vai;
3. controla orçamentos mensais por categoria;
4. lembra das contas recorrentes cadastradas à mão.

Sucesso: toda compra de cartão termina com um dono (ou divisão) confirmado; toda saída tem categoria; cada fechamento de fatura produz o total por pessoa sem conta manual; você sabe quanto já gastou de cada orçamento e quais contas vencem.

## 2. Escopo

### Dentro do MVP
- **Cartão de crédito** (BB, Inter, Mercado Pago): uma mensagem por compra nova, com dono (ou divisão por percentual) e categoria; parcelas herdam dono e divisão da primeira parcela classificada.
- **Contas correntes**: Pix, débito e entradas viram movimentações, categorizadas com a mesma lógica (memória por estabelecimento, pergunta quando desconhecido).
- **Categorias e memória** por estabelecimento, com sugestão confirmada pelo usuário.
- **Orçamento** mensal por categoria, com aviso aos 80% e ao estourar.
- **Contas recorrentes** cadastradas manualmente, com lembrete 3 dias antes e no dia; sem leitura de boleto e sem pareamento automático com Pix.
- Resposta por **texto ou áudio**; uso por **uma única pessoa**, em conversa privada.
- Pendências: lembrete diário e aviso no fechamento da fatura antes de calcular os totais.
- Fechamento **por fatura**: total por pessoa daquela fatura, e aviso do vencimento.
- Consultas fixas: `!pendentes`, `!fatura`, `!gastos`, `!contas`.

### Fora do MVP (registrado para depois)
- Cofrinhos do Mercado Pago (listagem e aviso diário de rendimento: "seu cofrinho do (banco) rendeu hoje X, saldo Y") e metas.
- Dívidas fora do cartão (empréstimos avulsos).
- Consultas em linguagem livre ("quanto gastei com mercado?").
- Detecção de cobranças duplicadas ou fora do padrão; comparação entre períodos; limite de gasto por pessoa.
- Outras pessoas recebendo o próprio resumo; grupo da família.
- Atribuição automática por regra (N classificações iguais).
- Saldo corrente por pessoa; abatimento de reembolsos (ex.: mãe devolve um Pix) no que ela deve.
- Produtos financeiros próprios (cartão, cashback, investimentos), integrações com Gmail/Agenda/Notion e agente que executa compras.

## 3. Stack

Node.js 22.13+ (ESM), `node:sqlite`, `node:test`, `fetch` nativo (sem SDKs). Bibliotecas: `@whiskeysockets/baileys`, `pino`, `qrcode-terminal`. Serviços: Pluggy (Meu Pluggy), Groq (Whisper), DeepSeek. Hospedagem: uma VM Oracle Always Free (Ubuntu) com systemd e journald; deploy por GitHub Actions com chave SSH restrita ao script de atualização. O bot antigo na VM será desligado; este é o único serviço.

## 4. Arquitetura

Um processo Node, um SQLite, um unit systemd. Padrão **ports and adapters**: o núcleo define contratos e nunca conhece serviços externos.

| Porta | Contrato | Adaptador do MVP |
|---|---|---|
| `FonteDeMovimentacoes` | devolve contas, cartões e movimentações no formato interno | `pluggy/` |
| `Transcritor` | áudio → texto | `groq/` |
| `Interpretador` | texto livre → atribuição ou categoria | `deepseek/` |
| `Mensageiro` | recebe e envia mensagens | `baileys/` |

Cada porta tem também um **adaptador falso** em memória para testes. Nenhum outro adaptador será construído no MVP, apenas o contrato.

Módulos: `whatsapp/` (Baileys, filtro por número), `pluggy/`, `transcricao/`, `interpretacao/` (parser rígido + fallback), `nucleo/` (regras puras, sem rede: atribuição, parcelas, categorias, orçamento, contas, fatura), `jobs/` (agendador), `db/` (SQLite e migrações).

A normalização é responsabilidade do adaptador. O sinal do valor (na Pluggy a compra de cartão é positiva) e o formato de parcelas de cada banco ficam em `pluggy/`; o núcleo só vê o formato interno de `movimentacao`.

### Fluxo
1. Job de sync (a cada 2 horas) pede as movimentações novas à `FonteDeMovimentacoes`.
2. O núcleo trata cada movimentação: parcela de grupo já classificado herda dono, divisão e categoria; estabelecimento com categoria conhecida recebe a categoria; pagamento de fatura e transferência entre contas próprias são marcados como transferência; o resto vira **pendente**.
3. O bot pergunta uma a uma: compra de cartão ("de quem é e qual categoria?"), saída de conta ("qual categoria?"), entrada ambígua ("renda ou reembolso?"). Sugestões vêm da memória do estabelecimento.
4. A resposta (texto, ou áudio transcrito) passa pelo parser rígido; se falhar, o `Interpretador` tenta, e o resultado é **sempre confirmado** antes de gravar.
5. Após gravar, o núcleo atualiza o consumo do orçamento e dispara os avisos devidos.
6. No fechamento de cada cartão, havendo pendências, o bot avisa; sem pendências, envia o total por pessoa da fatura.

## 5. Modelo de dados

Dinheiro em **centavos** (inteiro); percentuais em **pontos-base** (10000 = 100%); datas ISO. A sobra de arredondamento de uma divisão vai para "eu", de modo que a soma sempre bate com a movimentação.

- `pessoas`: nome e apelidos aceitos ("mamãe", "mana"). "Eu" é uma pessoa como as outras.
- `contas`: cartões e contas correntes (tipo, banco, apelido, `pluggy_account_id`, dia de fechamento e vencimento para cartões).
- `movimentacoes`: `pluggy_transaction_id` **único** (sync idempotente), conta, direção (`entrada`/`saida`), tipo (`compra_cartao`, `pix`, `debito`, `transferencia`, `pagamento_fatura`), descrição original, `estabelecimento_norm`, valor, data, categoria, parcela atual, total de parcelas, valor total, `grupo_parcelas_id`, fatura de referência (`AAAA-MM`), status (`pendente`, `classificada`, `ignorada`).
- `atribuicoes`: movimentação de cartão, pessoa, percentual; a soma por movimentação é sempre 10000.
- `categorias`: nome; iniciais: mercado, alimentação fora, lazer, transporte, moradia, saúde, assinaturas, compras, outros; editáveis. Entradas usam os tipos `renda` e `reembolso`.
- `memoria_estabelecimento`: `estabelecimento_norm` → categoria. O último dono por estabelecimento é consulta às atribuições, sem tabela própria.
- `orcamentos`: categoria, limite mensal, últimos avisos enviados (80% e 100%) por mês.
- `contas_a_pagar`: nome, valor aproximado, dia do mês, pago no mês (marcado por "paguei").
- `faturas`: cartão, mês de referência, fechada, resumo enviado.
- `perguntas`: movimentação e id da mensagem do WhatsApp, para ligar a resposta.
- `estado`: vencimento do consentimento da Pluggy, último sync, sessão do Baileys.

### Ligação entre resposta e movimentação
1. Se você usa "responder" na mensagem do bot, a ligação é exata, pelo id da mensagem.
2. Caso contrário, vale a **pergunta mais recente ainda aberta**, e o bot repete a movimentação na confirmação ("Netflix, R$ 55,90 → mãe, assinaturas. Confirma?").

### Parcelas
A Open Finance não devolve identificador que ligue as parcelas de uma compra. A primeira parcela classificada define o `grupo_parcelas_id`; as seguintes entram no grupo quando batem estabelecimento, valor total e número de parcela esperado. Se a heurística falhar, a parcela vira pendente normal. Alguns bancos só exibem a parcela no fechamento da fatura, fora da janela de 7 dias do sync; o sync deve cobrir isso.

## 6. Categorias, orçamento e contas

### Categorização
1. Estabelecimento com categoria na memória: usa, sem perguntar.
2. Senão: o bot pergunta; o DeepSeek pode **sugerir**, mas a confirmação é sua.
3. A categoria confirmada entra na memória do estabelecimento.

Em compra de cartão uma pergunta cobre dono e categoria ("mãe mercado").

### Regras para não distorcer os números
- **Seu gasto real** = suas saídas de conta (Pix, débito) mais a **sua parte** das compras de cartão. O que é de outras pessoas não entra no seu orçamento.
- **Pagamento de fatura** e transferência entre contas próprias são `transferencia` e **não contam como gasto** (evita contar a compra duas vezes).
- **Entradas** são `renda` (ex.: salário) ou `reembolso` (ex.: mãe devolve um Pix). Reembolso não é renda e, no MVP, é só registrado, sem abater o que a pessoa deve.

### Orçamento
Limite mensal por categoria (ex.: "orçamento lazer 500"), mês calendário, somente seu gasto real. Aviso aos 80% e ao estourar, uma vez cada por mês.

### Contas recorrentes
Cadastro manual pelo chat ("conta internet 120 dia 10"). O bot lembra 3 dias antes e no dia; "paguei" encerra o mês. Sem leitura de boleto e sem pareamento automático com Pix.

### Consultas fixas
`!pendentes`, `!fatura`, `!gastos` (mês por categoria e saldo de cada orçamento), `!contas` (próximos vencimentos).

## 7. Interpretação das respostas

Parser rígido primeiro (nomes e apelidos cadastrados, categorias, percentuais, "sim/não", "paguei"); o DeepSeek só entra se o parser não entender, e seu resultado é sempre confirmado. Áudio: Groq transcreve para texto e o texto segue o mesmo caminho. Para o DeepSeek vai apenas o texto da resposta e o nome do estabelecimento.

## 8. Falhas

- **Pluggy fora ou no limite de chamadas:** nova tentativa com espera crescente; após 3 falhas seguidas, um único aviso; segue tentando nos ciclos seguintes.
- **Consentimento Open Finance (expira em 12 meses):** aviso 30 dias antes, e de novo se o sync falhar por autorização.
- **Groq falhou:** "não consegui ouvir, manda por texto"; a pergunta continua aberta.
- **DeepSeek falhou ou ambíguo:** nada é gravado; o bot mostra exemplos do formato.
- **Baileys caiu:** reconexão automática; se deslogar, novo pareamento por QR via SSH; `HEARTBEAT_URL` opcional avisa quando o bot estiver fora.

### Carga inicial
A Pluggy traz 12 meses de histórico. Na primeira conexão, só as movimentações da **fatura aberta de cada cartão e do mês corrente das contas** viram pendentes; o restante entra como `ignorada`, servindo apenas para a memória de donos e categorias. As perguntas saem em ritmo controlado (no máximo 5 por vez).

## 9. Segurança

- Só o seu número é atendido; os demais são ignorados sem resposta.
- Chaves (Pluggy, Groq, DeepSeek) em `EnvironmentFile` do systemd com permissão 600, nunca no repositório. O pino redige segredos e não registra conteúdo de áudio.
- Backup diário do SQLite criptografado com GPG, incluído no plano de deploy.
- Deploy por GitHub Actions, com chave SSH restrita ao script de atualização.

## 10. Testes (`node:test`)

- Núcleo puro: divisão e arredondamento (a soma sempre bate), herança de parcelas com fixtures anonimizadas, memória de categoria e dono, gasto real (exclui transferências, pagamento de fatura e parte dos outros), avisos de orçamento, lembretes de contas, fechamento com pendências.
- Parser rígido: testes em tabela com frases em português.
- Teste de contrato executado contra cada adaptador de cada porta; adaptadores falsos permitem rodar a suíte inteira offline.

## 11. Riscos e etapa 0 (spike)

Antes de qualquer implementação, validar com as contas reais:
1. Se a Pluggy (Meu Pluggy) tem conector estável para **cartão de crédito e conta corrente** de BB, Inter e Mercado Pago.
2. Como cada banco devolve parcelas (`installmentNumber`, `totalInstallments`, `totalAmount`) e quais dados de contraparte vêm nos Pix.
3. Os limites mensais de chamadas por instituição e a frequência de sync viável.
4. Os termos do Meu Pluggy para uso pessoal contínuo (a fonte consultada não é oficial).

Se um banco não for coberto, o contrato `FonteDeMovimentacoes` permite um adaptador de importação de fatura/extrato (CSV/OFX) como plano B.

## 12. Processo

O repositório usará o Spec Kit (`spec.md`, `plan.md`, `tasks.md` em `specs/`, constituição em `.specify/memory/constitution.md`). Como o MVP agrupa vários subsistemas, o plano os ordena: etapa 0 (spike da Pluggy) → ingestão e núcleo de movimentações → classificação (dono e categoria) → fechamento de fatura → orçamento → contas recorrentes. Cada etapa fecha com testes antes da próxima.
