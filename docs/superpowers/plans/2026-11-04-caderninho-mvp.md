# Caderninho MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bot de WhatsApp pessoal que lê cartões e contas via Pluggy, pergunta dono e categoria de cada movimentação, fecha faturas por pessoa, controla orçamentos por categoria e lembra contas recorrentes.

**Architecture:** Um processo Node, um SQLite, ports and adapters. O `nucleo/` é código puro (sem rede); Pluggy, Groq, DeepSeek e Baileys ficam em `src/adaptadores/` atrás de contratos em `src/portas/`, cada um com um adaptador falso em `src/falsos/` usado em toda a suíte.

**Tech Stack:** Node.js 22.13+ (ESM), `node:sqlite`, `node:test`, `fetch` nativo; `@whiskeysockets/baileys` 7.0.0-rc14, `pino` 9.6.0, `qrcode-terminal` 0.12.0.

**Spec:** `docs/superpowers/specs/2026-11-04-caderninho-design.md`

## Global Constraints

- Node.js 22.13+, ESM (`"type": "module"`); testes com `node --test`; HTTP só com `fetch` nativo, sem SDKs.
- Dependências de produção: somente `@whiskeysockets/baileys`, `pino`, `qrcode-terminal` (versões acima, exatas).
- Dinheiro em **centavos** (inteiro); percentuais em **pontos-base** (10000 = 100%); datas ISO; a sobra de arredondamento vai para "eu".
- O `nucleo/` nunca importa de `adaptadores/` nem faz rede.
- Só o número do dono é atendido; os demais são ignorados sem resposta.
- Sync a cada 2 horas; lembrete de conta 3 dias antes e no dia; orçamento avisa aos 80% e ao estourar (uma vez cada por mês); aviso de consentimento 30 dias antes de vencer; 1 único aviso após 3 falhas seguidas do sync; no máximo 5 perguntas abertas por vez.
- Resultado de IA (DeepSeek) é sempre confirmado pelo usuário antes de gravar; para o DeepSeek vai só o texto da resposta e o nome do estabelecimento.
- Chaves só em variáveis de ambiente (`EnvironmentFile`, permissão 600); pino redige segredos e nunca registra conteúdo de áudio.
- Pagamento de fatura e transferência entre contas próprias são `transferencia` e nunca contam como gasto.
- Textos do bot em português do Brasil; identificadores de domínio em português, como na spec.

## Review Focus

1. Mesma movimentação reaparecendo em syncs seguintes não duplica nem reabre pergunta (Task 9).
2. Valor que não divide exato (R$ 0,01 entre dois, R$ 10,00 entre três) mantém a soma igual ao total (Task 3).
3. Percentuais que não fecham 100% ("mãe 60, irmã 60") nunca são gravados; o bot pede de novo com exemplo (Task 10).
4. Mensagem de outro número ou de grupo é ignorada sem qualquer resposta (Task 11).
5. Estorno no cartão (valor negativo na Pluggy) vira entrada `estorno`, passa pela pergunta de dono e reduz o gasto real, em vez de virar gasto negativo solto (Tasks 6 e 17).

## Estrutura de arquivos

```
package.json  .gitignore  .env.example  .specify/memory/constitution.md
spike/pluggy.js                       # etapa 0, descartável
src/main.js  src/config.js  src/comandos.js  src/bot.js
src/db/{abrir.js,repositorio.js,migracoes/001_inicial.sql}
src/nucleo/{dinheiro,estabelecimento,parcelas,classificacao,fatura,gasto,orcamento,contas}.js
src/interpretacao/parser.js
src/portas/{fonte,transcritor,interpretador,mensageiro}.js
src/falsos/{fonte,transcritor,interpretador,mensageiro}.js
src/adaptadores/{pluggy/{cliente,mapear,fonte}.js,groq/transcritor.js,deepseek/interpretador.js,baileys/mensageiro.js}
src/whatsapp/filtro.js
src/jobs/{sync,saude,agendador}.js
deploy/{caderninho.service,atualizar.sh,backup.sh}  .github/workflows/deploy.yml
test/** (espelha src/)  test/fixtures/pluggy/*.json
```

---

### Task 0: Esqueleto do projeto e constituição

**Files:**
- Create: `package.json`, `.gitignore`, `.env.example`, `.specify/memory/constitution.md`, `test/smoke.test.js`

- [ ] **Step 1: Escrever `test/smoke.test.js`** — `import('node:sqlite')` resolve e `new DatabaseSync(':memory:')` executa `select 1`.
- [ ] **Step 2: Criar `package.json`** (`type: module`, `engines.node >=22.13`, script `test: node --test`), instalar as 3 dependências com `npm install --save-exact`. `.gitignore`: `node_modules`, `.env`, `*.db`, `auth/`. `.env.example` lista todas as variáveis usadas pelo plano (`PLUGGY_CLIENT_ID`, `PLUGGY_CLIENT_SECRET`, `PLUGGY_ITEM_IDS`, `GROQ_API_KEY`, `DEEPSEEK_API_KEY`, `DEEPSEEK_MODEL`, `DONO_JID`, `DONO_LID`, `NOMES_PROPRIOS`, `DB_PATH`, `HEARTBEAT_URL`) sem valores reais.
- [ ] **Step 3: `constitution.md`** com os princípios: núcleo sem rede, três dependências, dinheiro em centavos, TDD, nada gravado sem confirmação, segredos fora do repositório.
- [ ] **Step 4:** `npm test` → PASS.
- [ ] **Step 5: Commit** `chore: esqueleto do projeto e constituição`.

### Task 1: Etapa 0 — spike da Pluggy (descartável)

**Files:**
- Create: `spike/pluggy.js`, `docs/spike-pluggy.md`, `test/fixtures/pluggy/{contas,cartao,corrente}.json`

**Interfaces:**
- Produces: fixtures anonimizadas (formato real devolvido pela Pluggy) usadas na Task 6; `docs/spike-pluggy.md` com as respostas às 4 perguntas do §11 da spec.

- [ ] **Step 1: Pedir ao dono** os `PLUGGY_CLIENT_ID`, `PLUGGY_CLIENT_SECRET` e os `itemId` das conexões (BB, Inter, Mercado Pago) criadas no Meu Pluggy, em `.env` local (nunca no commit).
- [ ] **Step 2: Escrever `spike/pluggy.js`**: autentica, lista contas de cada item, baixa transações dos últimos 90 dias de cada conta e grava JSON bruto em `spike/saida/` (ignorado pelo git). Conferir endpoints e campos em docs.pluggy.ai antes de codar.
- [ ] **Step 3: Rodar** `node --env-file=.env spike/pluggy.js`. Esperado: um arquivo por conta, sem erro de autenticação.
- [ ] **Step 4: Anonimizar** (trocar nomes de pessoas, CPF e números; manter estrutura, sinais e campos de parcela) e salvar em `test/fixtures/pluggy/`. Incluir ao menos: compra à vista, compra parcelada, estorno, Pix enviado, Pix recebido, pagamento de fatura.
- [ ] **Step 5: Preencher `docs/spike-pluggy.md`** respondendo: (1) cada banco expõe cartão e conta corrente? (2) como vêm parcelas e contraparte de Pix? (3) limites de chamadas observados? (4) termos do Meu Pluggy para uso pessoal contínuo. **Gate:** se algum banco não for coberto, parar e decidir com o dono (plano B: adaptador CSV/OFX) antes da Task 6.
- [ ] **Step 6: Commit** `docs: resultado do spike da Pluggy e fixtures anonimizadas`.

### Task 2: Banco de dados e migrações

**Files:**
- Create: `src/db/abrir.js`, `src/db/migracoes/001_inicial.sql`
- Test: `test/db/abrir.test.js`

**Interfaces:**
- Produces: `abrirBanco(caminho = ':memory:'): DatabaseSync` — aplica as migrações pendentes em ordem, usando `PRAGMA user_version`, com `foreign_keys = ON`.

- [ ] **Step 1: Testes:** `abrirBanco` cria as tabelas `pessoas, contas, movimentacoes, atribuicoes, categorias, memoria_estabelecimento, orcamentos, contas_a_pagar, faturas, perguntas, estado`; chamar duas vezes sobre o mesmo arquivo não falha nem duplica; inserir duas `movimentacoes` com o mesmo `id_externo` lança erro (UNIQUE); `atribuicoes` aceita `bp` de 1 a 10000 e rejeita 0 e 10001.
- [ ] **Step 2:** `node --test test/db/abrir.test.js` → FAIL (módulo inexistente).
- [ ] **Step 3: Implementar** `abrirBanco` e `001_inicial.sql` com as colunas do §5 da spec (valores em INTEGER centavos, status e direção com CHECK).
- [ ] **Step 4:** mesmo comando → PASS.
- [ ] **Step 5: Commit** `feat: banco SQLite com migrações`.

### Task 3: Dinheiro e divisão

**Files:**
- Create: `src/nucleo/dinheiro.js`
- Test: `test/nucleo/dinheiro.test.js`

**Interfaces:**
- Produces: `dividirCentavos(totalCentavos: number, partes: {pessoaId: number, bp: number}[], pessoaSobraId: number): {pessoaId: number, centavos: number}[]` (lança `Error` se a soma de `bp` ≠ 10000); `formatarReais(centavos: number): string` (`5590` → `"R$ 55,90"`).

- [ ] **Step 1: Testes:** 1000 centavos em 10000 bp para uma pessoa → `[{1,1000}]`; `1` centavo 50/50 com sobra para pessoa 1 → pessoa 1 recebe 1, a outra 0; 1000 centavos em 3334/3333/3333 bp → soma exatamente 1000; bp somando 12000 lança erro; `formatarReais(5590) === "R$ 55,90"` e `formatarReais(100000) === "R$ 1.000,00"`.
- [ ] **Step 2:** `node --test test/nucleo/dinheiro.test.js` → FAIL.
- [ ] **Step 3: Implementar** com `Math.floor(total * bp / 10000)` por parte; a diferença para o total soma-se à parte de `pessoaSobraId`.
- [ ] **Step 4:** → PASS.
- [ ] **Step 5: Commit** `feat: divisão de valores em centavos`.

### Task 4: Normalização de estabelecimento

**Files:**
- Create: `src/nucleo/estabelecimento.js`
- Test: `test/nucleo/estabelecimento.test.js`

**Interfaces:**
- Produces: `normalizarEstabelecimento(descricao: string): string` — minúsculas, sem acentos, sem prefixos de canal (`pix`, `compra`, `pag*`, `mp*`), sem números de parcela (`02/06`), sem sufixos societários (`ltda`, `sa`, `me`), espaços colapsados.

- [ ] **Step 1: Testes:** `"PIX MERC SAO JOSE LTDA"` e `"Merc São José"` dão o mesmo resultado; `"NETFLIX.COM 02/06"` → `"netflix.com"`; string vazia → `""`.
- [ ] **Step 2–4:** rodar (FAIL), implementar, rodar (PASS) com `node --test test/nucleo/estabelecimento.test.js`.
- [ ] **Step 5: Commit** `feat: normalização de nomes de estabelecimento`.

### Task 5: Portas, falsos e testes de contrato

**Files:**
- Create: `src/portas/{fonte,transcritor,interpretador,mensageiro}.js`, `src/falsos/{fonte,transcritor,interpretador,mensageiro}.js`
- Test: `test/contratos/{fonte,mensageiro}.js` (exportam `testarContratoFonte(nome, criar)` e `testarContratoMensageiro(nome, criar)`), `test/falsos.test.js`

**Interfaces:**
- Produces (JSDoc typedefs nas portas):
  - `ContaExterna = {idExterno: string, tipo: 'cartao'|'corrente', banco: string, apelido: string, diaFechamento?: number, diaVencimento?: number}`
  - `Movimentacao = {idExterno: string, contaExternaId: string, direcao: 'entrada'|'saida', tipo: 'compra_cartao'|'pix'|'debito'|'transferencia'|'pagamento_fatura'|'estorno', descricao: string, valorCentavos: number /* sempre positivo */, data: string /* AAAA-MM-DD */, parcelaAtual?: number, totalParcelas?: number, valorTotalCentavos?: number}`
  - `FonteDeMovimentacoes = {listarContas(): Promise<ContaExterna[]>, listarMovimentacoes(contaExternaId: string, desde: string): Promise<Movimentacao[]>}`
  - `Transcritor = {transcrever(audio: Buffer, mime: string): Promise<string>}`
  - `Interpretador = {interpretar(texto: string, contexto: object): Promise<Resultado>, sugerirCategoria(estabelecimento: string, categorias: string[]): Promise<string|null>}` (`Resultado` definido na Task 10)
  - `Mensageiro = {aoReceber(cb: (msg: {id: string, deJid: string, texto?: string, audio?: {buffer: Buffer, mime: string}, respondeAId?: string}) => void): void, enviar(texto: string): Promise<{id: string}>}`
  - `ErroLimite`, exportado de `fonte.js`, para limites de chamadas.
- Falsos aceitam dados no construtor e registram chamadas (`enviadas`, etc.).

- [ ] **Step 1: Testes de contrato:** a fonte devolve só `valorCentavos` inteiros positivos, `data` no formato ISO e `idExterno` únicos; `listarMovimentacoes` com `desde` filtra por data; o mensageiro falso entrega mensagens ao callback e `enviar` devolve `id` único.
- [ ] **Step 2:** `node --test test/falsos.test.js` → FAIL.
- [ ] **Step 3: Implementar** portas (typedefs e `ErroLimite`) e falsos.
- [ ] **Step 4:** → PASS.
- [ ] **Step 5: Commit** `feat: portas, adaptadores falsos e testes de contrato`.

### Task 6: Adaptador Pluggy

**Files:**
- Create: `src/adaptadores/pluggy/{cliente,mapear,fonte}.js`
- Test: `test/adaptadores/pluggy.test.js` (usa as fixtures da Task 1 e um `fetch` falso)

**Interfaces:**
- Consumes: `FonteDeMovimentacoes`, `ErroLimite` (Task 5); fixtures (Task 1).
- Produces: `criarFontePluggy({clientId, clientSecret, itemIds, fetch = globalThis.fetch}): FonteDeMovimentacoes`; `mapearTransacao(transacao, conta): Movimentacao` em `mapear.js`.

- [ ] **Step 1: Testes** (valores vêm das fixtures): compra de cartão (valor positivo na Pluggy) → `direcao: 'saida'`, `tipo: 'compra_cartao'`; **valor negativo em cartão (estorno)** → `direcao: 'entrada'`, `tipo: 'estorno'`, valor positivo; conta corrente negativa → `saida`, positiva → `entrada`; Pix reconhecido pelo tipo/descrição → `tipo: 'pix'`; "pagamento de fatura" → `tipo: 'pagamento_fatura'`; campos de parcela mapeados; paginação seguida até o fim; HTTP 429 lança `ErroLimite`; passa em `testarContratoFonte` com `fetch` falso. O token é reutilizado entre chamadas.
- [ ] **Step 2:** `node --test test/adaptadores/pluggy.test.js` → FAIL.
- [ ] **Step 3: Implementar.** Toda a normalização (sinal, parcelas) fica em `mapear.js`; `cliente.js` só autentica e pagina.
- [ ] **Step 4:** → PASS.
- [ ] **Step 5: Commit** `feat: adaptador Pluggy`.

### Task 7: Heurística de parcelas

**Files:**
- Create: `src/nucleo/parcelas.js`
- Test: `test/nucleo/parcelas.test.js`

**Interfaces:**
- Produces: `acharGrupoParcelas(mov: Movimentacao & {estabelecimentoNorm: string}, grupos: {id: number, estabelecimentoNorm: string, valorTotalCentavos: number, totalParcelas: number, ultimaParcela: number}[]): number|null`

- [ ] **Step 1: Testes:** parcela 2/6 com grupo do mesmo estabelecimento, mesmo total e `ultimaParcela === 1` → id do grupo; total diferente → `null`; parcela 1/6 → `null` (abre grupo novo); parcela 3/6 com grupo em `ultimaParcela === 1` (parcela 2 faltando) → `null`; sem campos de parcela → `null`.
- [ ] **Step 2–4:** FAIL, implementar (exige `parcelaAtual === ultimaParcela + 1`), PASS com `node --test test/nucleo/parcelas.test.js`.
- [ ] **Step 5: Commit** `feat: herança de parcelas`.

### Task 8: Repositório e decisão de classificação

**Files:**
- Create: `src/db/repositorio.js`, `src/nucleo/classificacao.js`, `src/nucleo/fatura.js` (só `faturaRefDe`)
- Test: `test/db/repositorio.test.js`, `test/nucleo/classificacao.test.js`, `test/nucleo/fatura-ref.test.js`

**Interfaces:**
- Consumes: `abrirBanco`, `normalizarEstabelecimento`, `acharGrupoParcelas`.
- Produces — `criarRepositorio(db)` com:
  - `inserirMovimentacao(mov: Movimentacao, extras: {contaId: number, status: 'pendente'|'classificada'|'ignorada', categoria?: string, faturaRef?: string, grupoParcelasId?: number}): number|null` (`null` quando o `id_externo` já existe)
  - `obterMovimentacao(id)`, `listarPendentes(): Movimentacao[]` (mais antigas primeiro)
  - `gravarAtribuicoes(movId: number, partes: {pessoaId: number, bp: number}[]): void`, `definirCategoria(movId: number, categoria: string): void`, `marcarClassificada(movId: number): void`, `marcarIgnorada(movId: number): void`
  - `memoriaCategoria(estabNorm): string|null`, `salvarMemoria(estabNorm, categoria): void`, `ultimoDono(estabNorm): {pessoaId, bp}[]|null`
  - `gruposParcelas(): GrupoParcelas[]`, `abrirGrupo(...)`: number
  - `registrarPergunta(movId, mensagemId): void`, `perguntaPorMensagem(mensagemId): number|null`, `perguntasAbertas(): {movId, mensagemId}[]` (mais recente primeiro), `fecharPergunta(movId)`
  - `obterEstado(chave): string|null`, `definirEstado(chave, valor): void`
  - listagem de pessoas/categorias/contas conforme usado nas tasks seguintes (`listarPessoas()`, `listarCategorias()`, `listarContas()`).
- `decidir(mov, ctx: {memoria: (estabNorm)=>string|null, grupos, nomesProprios: string[]}): Decisao` onde `Decisao = {acao: 'transferencia'} | {acao: 'herdar', grupoId: number} | {acao: 'categorizar', categoria: string} | {acao: 'pendente', sugestaoCategoria?: string}`.
- `faturaRefDe(dataISO: string, diaFechamento: number): string` (`'AAAA-MM'`; compra depois do dia de fechamento vai para a fatura do mês seguinte).

- [ ] **Step 1: Testes do repositório:** inserir o mesmo `id_externo` duas vezes devolve `null` na segunda; perguntas abertas voltam da mais recente para a mais antiga; `ultimoDono` devolve as partes da última classificação do estabelecimento. **Testes de `decidir`:** `pagamento_fatura` e `transferencia` (descrição com nome em `nomesProprios`) → `transferencia`; parcela 2/6 com grupo → `herdar`; Pix com estabelecimento na memória → `categorizar`; `compra_cartao` com memória → `pendente` com `sugestaoCategoria` (o dono ainda é perguntado); entrada → `pendente`; estorno → `pendente`. **`faturaRefDe`:** `('2026-10-20', 15)` → `'2026-11'`; `('2026-10-10', 15)` → `'2026-10'`; `('2026-12-20', 15)` → `'2027-01'`.
- [ ] **Step 2:** `node --test test/db test/nucleo` → FAIL.
- [ ] **Step 3: Implementar.**
- [ ] **Step 4:** → PASS.
- [ ] **Step 5: Commit** `feat: repositório e decisão de classificação`.

### Task 9: Job de sync e carga inicial

**Files:**
- Create: `src/jobs/sync.js`
- Test: `test/jobs/sync.test.js`

**Interfaces:**
- Consumes: `FonteDeMovimentacoes`, `criarRepositorio`, `decidir`, `faturaRefDe`, `normalizarEstabelecimento`.
- Produces: `sincronizar({fonte, repo, hoje: string /* AAAA-MM-DD */, nomesProprios: string[]}): Promise<{novas: number, pendentes: number}>`.

- [ ] **Step 1: Testes** (fonte e banco falsos): primeiro sync ⇒ movimentações fora da fatura aberta (cartão) ou fora do mês corrente (conta) entram como `ignorada`, as demais conforme `decidir`; **segundo sync com as mesmas movimentações ⇒ `novas: 0`, nenhuma pergunta nova e nenhum registro duplicado (Review Focus 1)**; `herdar` copia as atribuições e a categoria da primeira parcela; `categorizar` grava categoria e marca `classificada`; `transferencia` marca `classificada` sem pergunta; `ErroLimite` da fonte propaga.
- [ ] **Step 2–4:** FAIL, implementar (o primeiro sync é detectado por `obterEstado('ultimoSync') === null`; ao final grava `ultimoSync`), PASS com `node --test test/jobs/sync.test.js`.
- [ ] **Step 5: Commit** `feat: job de sincronização com carga inicial`.

### Task 10: Parser rígido

**Files:**
- Create: `src/interpretacao/parser.js`
- Test: `test/interpretacao/parser.test.js` (tabela de frases)

**Interfaces:**
- Produces: `interpretarResposta(texto: string, ctx: {pessoas: {id: number, nome: string, apelidos: string[], ehEu: boolean}[], categorias: string[]}): Resultado` com
  `Resultado = {tipo: 'atribuicao', partes: {pessoaId: number, bp: number}[], categoria?: string} | {tipo: 'categoria', categoria: string} | {tipo: 'confirmacao', valor: boolean} | {tipo: 'entrada', classe: 'renda'|'reembolso'} | {tipo: 'comando', nome: string, args: string[]} | {tipo: 'invalido', motivo: 'soma'|'desconhecido'}`.
  Resultados vindos da IA recebem `precisaConfirmar: true` (Task 15).

- [ ] **Step 1: Tabela de testes** (acento e caixa ignorados): `"mãe"` → mãe 10000; `"mamãe"` (apelido) → mãe 10000; `"irmã 50%"` → irmã 5000 e "eu" 5000 (resto vai para o dono do bot); `"mãe 30, eu 70"` → 3000/7000; `"mãe mercado"` → mãe 10000 com `categoria: 'mercado'`; **`"mãe 60, irmã 60"` → `{tipo:'invalido', motivo:'soma'}` (Review Focus 3)**; `"sim"`/`"s"` → confirmação true, `"não"` → false; `"renda"`, `"reembolso"` → entrada; `"mercado"` sozinho → categoria; `"!gastos"` → comando; `"orçamento lazer 500"` → comando `orcamento` com args `['lazer','500']`; `"conta internet 120 dia 10"` → comando `conta`; `"paguei internet"` → comando `paguei`; texto aleatório → `desconhecido`.
- [ ] **Step 2–4:** FAIL, implementar, PASS com `node --test test/interpretacao/parser.test.js`.
- [ ] **Step 5: Commit** `feat: parser rígido de respostas`.

### Task 11: Filtro de remetente e adaptador Baileys

**Files:**
- Create: `src/whatsapp/filtro.js`, `src/adaptadores/baileys/mensageiro.js`
- Test: `test/whatsapp/filtro.test.js`

**Interfaces:**
- Produces: `ehDoDono(jid: string, dono: {jid?: string, lid?: string}): boolean` (falso para grupos `@g.us`, para qualquer outro número e para `status@broadcast`); `criarMensageiroBaileys({authDir, dono, logger}): Mensageiro` — baixa o áudio recebido para `Buffer`, repassa `respondeAId` a partir do `stanzaId` da mensagem citada, usa `qrcode-terminal` no pareamento e reconecta sozinho exceto em logout.

- [ ] **Step 1: Testes do filtro (Review Focus 4):** JID do dono aceito; LID do dono aceito; outro número rejeitado; mensagem de grupo do dono rejeitada; `status@broadcast` rejeitado; JID com sufixo de dispositivo (`:12@`) do dono aceito.
- [ ] **Step 2–4:** FAIL, implementar filtro, PASS com `node --test test/whatsapp/filtro.test.js`.
- [ ] **Step 5: Implementar o adaptador Baileys** (sem teste unitário). Verificação manual: iniciar um script que o instancia, ler o QR, mandar "oi" do número do dono e ver o callback; mandar de outro número e confirmar que nada acontece.
- [ ] **Step 6: Commit** `feat: filtro do dono e adaptador Baileys`.

### Task 12: Perguntas pendentes e ligação de respostas

**Files:**
- Create: `src/bot.js` (parte 1)
- Test: `test/bot/perguntas.test.js`

**Interfaces:**
- Consumes: `Mensageiro`, repositório, `formatarReais`.
- Produces: `criarBot({repo, mensageiro, transcritor, interpretador, agora: () => string}): {perguntarPendentes(): Promise<void>, aoReceber(msg): Promise<void>}`.
  Texto da pergunta: compra de cartão → `"<descrição>, R$ x,xx no <apelido do cartão>. De quem é e qual categoria?"` (com `"Última vez foi da <pessoa>, <categoria>. Mesma coisa? sim/não"` quando há sugestão); saída de conta → `"... Qual categoria?"`; entrada → `"... Renda ou reembolso?"`.

- [ ] **Step 1: Testes** (mensageiro e banco falsos): `perguntarPendentes` envia uma mensagem por pendente e registra a pergunta, parando em **5 perguntas abertas**; chamar de novo sem respostas não envia nada; uma resposta que cita (`respondeAId`) a mensagem N resolve a movimentação N, mesmo havendo perguntas mais novas; sem citação resolve a **pergunta aberta mais recente**.
- [ ] **Step 2–4:** FAIL, implementar (resolução de resposta como função interna `resolverAlvo(msg): {movId, exato: boolean}|null`), PASS com `node --test test/bot/perguntas.test.js`.
- [ ] **Step 5: Commit** `feat: perguntas pendentes e ligação de respostas`.

### Task 13: Gravação das respostas e confirmação

**Files:**
- Modify: `src/bot.js`
- Test: `test/bot/respostas.test.js`

**Interfaces:**
- Consumes: `interpretarResposta`, `dividirCentavos`, repositório (Task 8).
- Produces: `aoReceber(msg)` completo para texto: parser → grava e responde com eco `"✓ <descrição> → <pessoa(s)> · <categoria>"` quando a resposta citou a pergunta e o parser entendeu; **pede `"Confirma?"` antes de gravar** quando não houve citação ou quando o resultado veio de IA; `"sim"`/`"não"` confirmam ou descartam o resultado pendente de confirmação, e `"sim"` a uma sugestão grava dono e categoria sugeridos; `invalido/soma` e `desconhecido` respondem com exemplos do formato e **não gravam nada**; após gravar, salva a memória de categoria e marca a movimentação `classificada`; ao fechar uma pergunta, chama `perguntarPendentes` para repor a fila.

- [ ] **Step 1: Testes:** resposta citada `"mãe mercado"` grava atribuição 10000 e categoria e salva memória; resposta sem citação **não grava** até o `"sim"`; `"não"` após confirmação descarta e mantém a pergunta aberta; **`"mãe 60, irmã 60"` não grava e a resposta contém um exemplo (Review Focus 3)**; entrada `"reembolso"` grava classe sem atribuição; "sim" à sugestão grava o último dono.
- [ ] **Step 2–4:** FAIL, implementar, PASS com `node --test test/bot/respostas.test.js`.
- [ ] **Step 5: Commit** `feat: gravação de respostas com confirmação`.

### Task 14: Transcrição de áudio (Groq)

**Files:**
- Create: `src/adaptadores/groq/transcritor.js`
- Modify: `src/bot.js`
- Test: `test/adaptadores/groq.test.js`, `test/bot/audio.test.js`

**Interfaces:**
- Produces: `criarTranscritorGroq({apiKey, fetch = globalThis.fetch, modelo = 'whisper-large-v3-turbo'}): Transcritor` (POST multipart a `https://api.groq.com/openai/v1/audio/transcriptions` com `language: 'pt'`); `ErroTranscricao` quando a resposta é vazia ou HTTP ≠ 200.
- No bot: mensagem com `audio` é transcrita e segue o mesmo caminho do texto; em `ErroTranscricao` responde `"Não consegui ouvir o áudio, manda por texto."` e a pergunta continua aberta.

- [ ] **Step 1: Testes:** corpo enviado contém o modelo, `language=pt` e o arquivo; texto devolvido é repassado; texto vazio lança `ErroTranscricao`; no bot, áudio "mãe mercado" (transcritor falso) grava como o texto; falha da transcrição não grava e envia a mensagem de erro.
- [ ] **Step 2–4:** FAIL, implementar, PASS com `node --test test/adaptadores/groq.test.js test/bot/audio.test.js`.
- [ ] **Step 5: Commit** `feat: transcrição de áudio com Groq`.

### Task 15: Interpretador de reserva (DeepSeek)

**Files:**
- Create: `src/adaptadores/deepseek/interpretador.js`
- Modify: `src/bot.js`
- Test: `test/adaptadores/deepseek.test.js`, `test/bot/ia.test.js`

**Interfaces:**
- Produces: `criarInterpretadorDeepSeek({apiKey, modelo, fetch}): Interpretador` — POST a `https://api.deepseek.com/chat/completions` em modo JSON; o prompt carrega só o texto da resposta, os nomes/apelidos das pessoas, as categorias e o nome do estabelecimento; resultado sempre com `precisaConfirmar: true`; JSON inválido ou HTTP ≠ 200 → `{tipo: 'invalido', motivo: 'desconhecido'}`. `sugerirCategoria` devolve uma categoria da lista ou `null`.
- No bot: `desconhecido` do parser aciona o interpretador; o resultado vai para confirmação (Task 13).

- [ ] **Step 1: Testes:** o corpo da requisição **não contém** valores nem o nome do cartão (apenas texto + estabelecimento); resposta válida vira `atribuicao` com `precisaConfirmar`; resposta fora do formato vira `invalido`; no bot, "foi da minha mãe" (parser falha, IA devolve mãe 100%) gera `"Confirma?"` e não grava até o "sim".
- [ ] **Step 2–4:** FAIL, implementar, PASS com `node --test test/adaptadores/deepseek.test.js test/bot/ia.test.js`.
- [ ] **Step 5: Commit** `feat: interpretador de reserva com DeepSeek`.

### Task 16: Fechamento e vencimento de fatura

**Files:**
- Modify: `src/nucleo/fatura.js`
- Test: `test/nucleo/fatura.test.js`

**Interfaces:**
- Produces: `totaisDaFatura(repo, contaId: number, ref: string, pessoaSobraId: number): {pessoaId: number, centavos: number}[]`; `verificarFaturas(repo, hoje: string): Aviso[]` com `Aviso = {tipo: 'pendencias', contaId, ref, quantidade} | {tipo: 'resumo', contaId, ref, totais} | {tipo: 'vencimento', contaId, ref, totais}`; `textoAviso(aviso, pessoas): string`.
- Regras: no dia seguinte ao `diaFechamento`, havendo pendências na fatura → aviso `pendencias` e **nenhum total**; sem pendências → `resumo`, uma única vez (`faturas.resumo_enviado`); 3 dias antes do `diaVencimento` → `vencimento` com os totais.

- [ ] **Step 1: Testes:** soma dos totais por pessoa = soma dos valores da fatura; divisão 3334/3333/3333 com sobra para o dono do bot; com 1 pendente só `pendencias`; sem pendentes `resumo`; segunda verificação no mesmo dia **não repete** o resumo; movimentações `ignorada` e de outra fatura ficam de fora; `vencimento` aparece exatamente 3 dias antes.
- [ ] **Step 2–4:** FAIL, implementar, PASS com `node --test test/nucleo/fatura.test.js`.
- [ ] **Step 5: Commit** `feat: fechamento e vencimento de fatura`.

### Task 17: Gasto real

**Files:**
- Create: `src/nucleo/gasto.js`
- Test: `test/nucleo/gasto.test.js`

**Interfaces:**
- Produces: `gastoRealPorCategoria(repo, mes: string /* AAAA-MM */, euId: number): Map<string, number>` (centavos); `textoGastos(mapa, orcamentos): string`.
- Regras: soma saídas de conta classificadas (`pix`, `debito`) **e** a parte de "eu" nas compras de cartão (via `dividirCentavos`); `transferencia` e `pagamento_fatura` ficam de fora; entradas `renda`/`reembolso` não são gasto; **`estorno` subtrai da categoria e da parte do dono** (Review Focus 5); só o mês calendário da data da movimentação.

- [ ] **Step 1: Testes:** Pix de R$ 142 em mercado soma; compra de cartão R$ 100 com mãe 100% **não** soma; compra de R$ 100 com eu 40%/mãe 60% soma R$ 40; pagamento de fatura de R$ 2.000 não soma; salário de R$ 6.500 não soma; estorno de R$ 30 do dono "eu" em lazer reduz lazer em R$ 30; movimentação do mês anterior não entra.
- [ ] **Step 2–4:** FAIL, implementar, PASS com `node --test test/nucleo/gasto.test.js`.
- [ ] **Step 5: Commit** `feat: cálculo de gasto real por categoria`.

### Task 18: Orçamento

**Files:**
- Create: `src/nucleo/orcamento.js`
- Test: `test/nucleo/orcamento.test.js`

**Interfaces:**
- Consumes: `gastoRealPorCategoria`.
- Produces: `definirOrcamento(repo, categoria: string, limiteCentavos: number): void`; `avisosDeOrcamento(repo, mes: string, euId: number): {categoria: string, nivel: 80|100, gasto: number, limite: number}[]` (marca o aviso como enviado em `orcamentos`).

- [ ] **Step 1: Testes:** 79% → nenhum aviso; 80% → um aviso nível 80; chamar de novo → nenhum; passar de 100% → um aviso nível 100; no mês seguinte os avisos voltam a valer; categoria sem orçamento nunca avisa; "orçamento lazer 500" define R$ 500,00 (50000 centavos).
- [ ] **Step 2–4:** FAIL, implementar, PASS com `node --test test/nucleo/orcamento.test.js`.
- [ ] **Step 5: Commit** `feat: orçamento por categoria com avisos`.

### Task 19: Contas recorrentes

**Files:**
- Create: `src/nucleo/contas.js`
- Test: `test/nucleo/contas.test.js`

**Interfaces:**
- Produces: `cadastrarConta(repo, nome: string, valorCentavos: number, dia: number): void`; `marcarPaga(repo, nome: string, mes: string): boolean`; `lembretesDoDia(repo, hoje: string): {nome, valorCentavos, vencimento: string, quando: 'em3dias'|'hoje'}[]`.
- Regras: lembra 3 dias antes e no dia; conta paga no mês não lembra; dia 31 em mês curto vence no último dia do mês; cada lembrete sai uma vez por dia.

- [ ] **Step 1: Testes:** conta dia 10 → lembra em 07 e em 10; após `marcarPaga` não lembra mais no mês; no mês seguinte volta; conta dia 31 em fevereiro vence dia 28 (ou 29); nome com acento e caixa diferentes ("Internet" × "internet") casa; `marcarPaga` de nome inexistente devolve `false`.
- [ ] **Step 2–4:** FAIL, implementar, PASS com `node --test test/nucleo/contas.test.js`.
- [ ] **Step 5: Commit** `feat: contas recorrentes e lembretes`.

### Task 20: Saúde — falhas, consentimento e lembrete diário

**Files:**
- Create: `src/jobs/saude.js`
- Test: `test/jobs/saude.test.js`

**Interfaces:**
- Produces: `comEspera(fn: () => Promise<T>, {tentativas: number, baseMs: number, esperar?: (ms) => Promise<void>}): Promise<T>` (espera dobrando a cada tentativa); `criarMonitorSync({aviso: (texto) => Promise<void>}): {sucesso(): void, falha(erro): Promise<void>}` (um **único** aviso na 3ª falha seguida; `sucesso` zera o contador e rearma o aviso); `avisoConsentimento(venceEm: string, hoje: string): string|null` (texto quando faltam ≤ 30 dias ou já venceu, senão `null`); `textoPendencias(quantidade: number): string|null`.

- [ ] **Step 1: Testes:** `comEspera` tenta N vezes e dobra a espera (usa `esperar` falso); 2 falhas não avisam, a 3ª avisa, a 4ª e a 5ª não repetem, um sucesso e 3 novas falhas avisam de novo; `avisoConsentimento` devolve `null` a 31 dias, texto a 30 dias e texto após vencido; `ErroLimite` conta como falha como qualquer outra; `textoPendencias(0)` → `null`.
- [ ] **Step 2–4:** FAIL, implementar, PASS com `node --test test/jobs/saude.test.js`.
- [ ] **Step 5: Commit** `feat: monitor de falhas e avisos de saúde`.

### Task 21: Comandos, agendador e inicialização

**Files:**
- Create: `src/comandos.js`, `src/jobs/agendador.js`, `src/config.js`, `src/main.js`
- Modify: `src/bot.js` (despacho de `tipo: 'comando'`)
- Test: `test/comandos.test.js`, `test/jobs/agendador.test.js`

**Interfaces:**
- Produces: `executarComando(nome: string, args: string[], ctx: {repo, hoje: string, euId: number}): string`, cobrindo `pendentes`, `fatura`, `gastos`, `contas`, `orcamento`, `conta`, `paguei`; `criarAgendador({relogio, tarefas}): {iniciar(): void, parar(): void}` com `sync` a cada 2 horas e `diario` às 09:00 (America/Sao_Paulo) executando: lembrete de pendências, `verificarFaturas`, `avisosDeOrcamento`, `lembretesDoDia` e `avisoConsentimento`; `carregarConfig(env): Config` falha com mensagem clara se faltar variável obrigatória.
- O vencimento do consentimento fica em `estado('consentimentoVenceEm')`: `main.js` o inicializa a partir da variável `CONSENTIMENTO_VENCE_EM` (AAAA-MM-DD, 12 meses após o consentimento no Meu Pluggy; acrescentar ao `.env.example`), a menos que o spike (Task 1) tenha mostrado um campo da Pluggy que o informe.
- `main.js` monta tudo: abre o banco, cria adaptadores reais, liga o mensageiro ao bot, agenda os jobs e faz o ping de `HEARTBEAT_URL` quando definida.

- [ ] **Step 1: Testes:** `!gastos` lista o mês por categoria com o que falta de cada orçamento; `!contas` lista os próximos vencimentos; `orcamento lazer 500` e `conta internet 120 dia 10` gravam e confirmam; `paguei internet` marca e confirma; comando desconhecido responde com a lista de comandos; o agendador dispara `sync` aos 2h e `diario` às 09:00 com relógio falso e não dispara duas vezes no mesmo dia; `carregarConfig({})` lança erro nomeando as variáveis ausentes.
- [ ] **Step 2–4:** FAIL, implementar, PASS com `node --test test/comandos.test.js test/jobs/agendador.test.js`.
- [ ] **Step 5: Verificação manual (smoke):** `node --env-file=.env src/main.js` com contas reais: parear o QR, aguardar o sync e responder a uma pergunta por texto e outra por áudio.
- [ ] **Step 6: Commit** `feat: comandos, agendador e inicialização`.

### Task 22: Deploy, backup e CI

**Files:**
- Create: `deploy/caderninho.service`, `deploy/atualizar.sh`, `deploy/backup.sh`, `.github/workflows/deploy.yml`, `scripts/backup.js`

**Interfaces:**
- Produces: `scripts/backup.js` gera uma cópia consistente do SQLite com `VACUUM INTO`; `backup.sh` chama o script, criptografa com `gpg --symmetric --cipher-algo AES256` e envia com `rclone`; `caderninho.service` usa `EnvironmentFile=/etc/caderninho.env` (permissão 600), `Restart=always`; `atualizar.sh` faz `git pull`, `npm ci --omit=dev` e `systemctl restart caderninho`; o workflow roda `npm test` em todo push e, só no `main` e com testes verdes, publica por SSH com chave restrita (`command="…/atualizar.sh"` no `authorized_keys`).

- [ ] **Step 1: Teste do `scripts/backup.js`** em `test/scripts/backup.test.js`: cria banco temporário com dados, roda o backup e abre a cópia confirmando que os dados estão lá.
- [ ] **Step 2–4:** FAIL, implementar, PASS com `node --test test/scripts/backup.test.js`.
- [ ] **Step 5: Escrever os arquivos de `deploy/` e o workflow**; validar o script com `bash -n deploy/*.sh` (sem saída = ok) e o unit com `systemd-analyze verify deploy/caderninho.service` onde disponível.
- [ ] **Step 6: Verificação manual na VM:** desligar o bot antigo (só após backup dele), instalar o unit, preencher `/etc/caderninho.env`, subir o serviço, conferir `journalctl -u caderninho` e agendar o `backup.sh` no cron.
- [ ] **Step 7: Commit** `chore: deploy, backup e CI`.
