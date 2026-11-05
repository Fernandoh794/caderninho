# Constituição do Caderninho

1. **Núcleo sem rede.** `src/nucleo/` é código puro: nunca importa de `src/adaptadores/`, nunca faz I/O de rede. Serviços externos só entram por portas (`src/portas/`).
2. **Três dependências.** Produção usa apenas `@whiskeysockets/baileys`, `pino` e `qrcode-terminal`, em versões exatas. Todo o resto é a biblioteca padrão do Node (`node:sqlite`, `node:test`, `fetch`).
3. **Dinheiro em centavos.** Valores são inteiros em centavos; percentuais em pontos-base (10000 = 100%). A sobra de arredondamento vai para "eu" e a soma sempre bate.
4. **TDD.** Todo comportamento nasce de um teste que falhou primeiro. Cada porta tem um adaptador falso e um teste de contrato; a suíte roda offline.
5. **Nada gravado sem confirmação.** Resultado de IA ou resposta sem citação é sempre confirmado antes de gravar.
6. **Segredos fora do repositório.** Chaves só em variáveis de ambiente (`EnvironmentFile` 600). Logs redigem segredos e nunca registram áudio.
