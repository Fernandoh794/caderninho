import { test } from 'node:test';
import assert from 'node:assert/strict';
import { montarBot } from './apoio.js';

test('resposta citada "mãe mercado" grava atribuição, categoria e memória', async () => {
  const { bot, mov, responder, idDaPergunta, repo, mae, mensageiro } = montarBot();
  const a = mov({ descricao: 'Merc São José' });
  await bot.perguntarPendentes();
  await responder('mãe mercado', idDaPergunta(a));
  const m = repo.obterMovimentacao(a);
  assert.equal(m.status, 'classificada');
  assert.equal(m.categoria, 'mercado');
  assert.deepEqual(repo.atribuicoesDe(a), [{ pessoaId: mae, bp: 10000 }]);
  assert.equal(repo.memoriaCategoria('merc sao jose'), 'mercado');
  assert.ok(mensageiro.enviadas.some((e) => e.texto === '✓ Merc São José → mãe · mercado'));
  assert.equal(repo.perguntasAbertas().length, 0);
});

test('sem citação não grava até o "sim"', async () => {
  const { bot, mov, responder, repo } = montarBot();
  const a = mov();
  await bot.perguntarPendentes();
  await responder('mãe mercado');
  assert.equal(repo.obterMovimentacao(a).status, 'pendente');
  assert.deepEqual(repo.atribuicoesDe(a), []);
  await responder('sim');
  assert.equal(repo.obterMovimentacao(a).status, 'classificada');
});

test('"não" depois do Confirma? descarta e mantém a pergunta aberta', async () => {
  const { bot, mov, responder, repo, mensageiro } = montarBot();
  const a = mov();
  await bot.perguntarPendentes();
  await responder('mãe mercado');
  await responder('não');
  assert.equal(repo.obterMovimentacao(a).status, 'pendente');
  assert.deepEqual(repo.atribuicoesDe(a), []);
  assert.ok(repo.perguntaAberta(a));
  assert.match(mensageiro.ultima(), /descartei/);
});

test('"mãe 60, irmã 60" não grava e responde com exemplo', async () => {
  const { bot, mov, responder, idDaPergunta, repo, mensageiro } = montarBot();
  const a = mov();
  await bot.perguntarPendentes();
  await responder('mãe 60, irmã 60', idDaPergunta(a));
  assert.equal(repo.obterMovimentacao(a).status, 'pendente');
  assert.deepEqual(repo.atribuicoesDe(a), []);
  assert.match(mensageiro.ultima(), /100%.*Exemplos: "mãe mercado"/s);
});

test('entrada "reembolso" grava a classe sem atribuição', async () => {
  const { bot, mov, responder, idDaPergunta, repo, conta } = montarBot();
  const a = mov({ contaId: conta, direcao: 'entrada', descricao: 'Pix recebido Maria' });
  await bot.perguntarPendentes();
  await responder('reembolso', idDaPergunta(a));
  assert.equal(repo.obterMovimentacao(a).categoria, 'reembolso');
  assert.equal(repo.obterMovimentacao(a).status, 'classificada');
  assert.deepEqual(repo.atribuicoesDe(a), []);
  assert.equal(repo.memoriaCategoria('maria'), null, 'entrada não alimenta memória de categoria');
});

test('"sim" à sugestão grava o último dono e a categoria', async () => {
  const { bot, mov, responder, idDaPergunta, repo, mae, eu } = montarBot();
  const antiga = mov({ descricao: 'Netflix', data: '2026-10-01' });
  repo.gravarAtribuicoes(antiga, [{ pessoaId: mae, bp: 6000 }, { pessoaId: eu, bp: 4000 }]);
  repo.definirCategoria(antiga, 'assinaturas');
  repo.marcarClassificada(antiga);
  repo.salvarMemoria('netflix', 'assinaturas');
  const nova = mov({ descricao: 'Netflix' });
  await bot.perguntarPendentes();
  await responder('sim', idDaPergunta(nova));
  assert.equal(repo.obterMovimentacao(nova).categoria, 'assinaturas');
  assert.deepEqual(repo.atribuicoesDe(nova), [{ pessoaId: eu, bp: 4000 }, { pessoaId: mae, bp: 6000 }]);
});

test('Pix só precisa da categoria', async () => {
  const { bot, mov, responder, idDaPergunta, repo, conta } = montarBot();
  const a = mov({ contaId: conta, descricao: 'Padaria' });
  await bot.perguntarPendentes();
  await responder('alimentação fora', idDaPergunta(a));
  assert.equal(repo.obterMovimentacao(a).status, 'classificada');
  assert.deepEqual(repo.atribuicoesDe(a), []);
});

test('cartão só com dono pede a categoria e mantém a pergunta aberta', async () => {
  const { bot, mov, responder, idDaPergunta, repo, mensageiro } = montarBot();
  const a = mov();
  await bot.perguntarPendentes();
  const id = idDaPergunta(a);
  await responder('mãe', id);
  assert.equal(repo.obterMovimentacao(a).status, 'pendente');
  assert.match(mensageiro.ultima(), /E a categoria\?/);
  await responder('lazer', id);
  assert.equal(repo.obterMovimentacao(a).status, 'classificada');
  assert.equal(repo.obterMovimentacao(a).categoria, 'lazer');
});

test('fechar uma pergunta repõe a fila até 5', async () => {
  const { bot, mov, responder, idDaPergunta, repo } = montarBot();
  const ids = Array.from({ length: 6 }, () => mov());
  await bot.perguntarPendentes();
  assert.equal(repo.perguntasAbertas().length, 5);
  await responder('mãe mercado', idDaPergunta(ids[0]));
  assert.equal(repo.perguntasAbertas().length, 5);
  assert.ok(repo.perguntaAberta(ids[5]));
});

test('parcela 1 classificada abre grupo de parcelas', async () => {
  const { bot, mov, responder, idDaPergunta, repo } = montarBot();
  const a = mov({ descricao: 'Loja X 01/06', parcelaAtual: 1, totalParcelas: 6, valorTotalCentavos: 33540 });
  await bot.perguntarPendentes();
  await responder('mãe compras', idDaPergunta(a));
  const g = repo.gruposParcelas();
  assert.equal(g.length, 1);
  assert.equal(g[0].ultimaParcela, 1);
  assert.equal(repo.obterMovimentacao(a).grupoParcelasId, g[0].id);
});
