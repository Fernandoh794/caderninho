import { test } from 'node:test';
import assert from 'node:assert/strict';
import { montarBot } from './apoio.js';

test('envia uma pergunta por pendente, no máximo 5 abertas', async () => {
  const { bot, mov, mensageiro, repo } = montarBot();
  for (let i = 0; i < 7; i++) mov();
  await bot.perguntarPendentes();
  assert.equal(mensageiro.enviadas.length, 5);
  assert.equal(repo.perguntasAbertas().length, 5);
  await bot.perguntarPendentes();
  assert.equal(mensageiro.enviadas.length, 5, 'não repete nem passa de 5');
});

test('texto da pergunta de cartão, conta e entrada', async () => {
  const { bot, mov, mensageiro, conta } = montarBot();
  mov({ descricao: 'Netflix' });
  mov({ contaId: conta, descricao: 'Padaria', valorCentavos: 1200 });
  mov({ contaId: conta, direcao: 'entrada', descricao: 'Salário', valorCentavos: 650000 });
  await bot.perguntarPendentes();
  const [a, b, c] = mensageiro.enviadas.map((e) => e.texto);
  assert.match(a, /Netflix, R\$ 55,90 no BB\. De quem é e qual categoria\?/);
  assert.match(b, /Padaria, R\$ 12,00.*Qual categoria\?/);
  assert.match(c, /R\$ 6\.500,00.*Renda ou reembolso\?/);
});

test('sugestão aparece quando há último dono e memória', async () => {
  const { bot, mov, mensageiro, repo, mae } = montarBot();
  const antiga = mov({ descricao: 'Netflix', data: '2026-10-01' });
  repo.gravarAtribuicoes(antiga, [{ pessoaId: mae, bp: 10000 }]);
  repo.definirCategoria(antiga, 'assinaturas');
  repo.marcarClassificada(antiga);
  repo.salvarMemoria('netflix', 'assinaturas');
  mov({ descricao: 'Netflix' });
  await bot.perguntarPendentes();
  assert.match(mensageiro.ultima(), /Última vez foi da mãe, assinaturas\. Mesma coisa\? sim\/não/);
});

test('resposta citada resolve a movimentação citada, mesmo com perguntas mais novas', async () => {
  const { bot, mov, responder, idDaPergunta, repo } = montarBot();
  const a = mov();
  const b = mov();
  await bot.perguntarPendentes();
  await responder('mãe mercado', idDaPergunta(a));
  assert.equal(repo.obterMovimentacao(a).status, 'classificada');
  assert.equal(repo.obterMovimentacao(b).status, 'pendente');
});

test('sem citação o alvo é a pergunta aberta mais recente', async () => {
  const { bot, mov, responder, mensageiro } = montarBot();
  mov({ descricao: 'Primeira' });
  mov({ descricao: 'Segunda' });
  await bot.perguntarPendentes();
  await responder('mãe mercado');
  assert.match(mensageiro.ultima(), /Segunda.*mãe.*mercado.*Confirma\?/s);
});

test('sem perguntas abertas responde que não há nada pendente', async () => {
  const { responder, mensageiro } = montarBot();
  await responder('mãe mercado');
  assert.match(mensageiro.ultima(), /[Nn]ada pendente/);
});
