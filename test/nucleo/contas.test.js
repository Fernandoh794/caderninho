import { test } from 'node:test';
import assert from 'node:assert/strict';
import { abrirBanco } from '../../src/db/abrir.js';
import { criarRepositorio } from '../../src/db/repositorio.js';
import { cadastrarConta, marcarPaga, lembretesDoDia, proximosVencimentos } from '../../src/nucleo/contas.js';

const novo = () => criarRepositorio(abrirBanco());
const quando = (repo, hoje) => lembretesDoDia(repo, hoje).map((l) => `${l.nome}:${l.quando}:${l.vencimento}`);

test('conta dia 10 lembra no dia 07 e no dia 10', () => {
  const repo = novo();
  cadastrarConta(repo, 'Internet', 12000, 10);
  assert.deepEqual(quando(repo, '2026-11-06'), []);
  assert.deepEqual(quando(repo, '2026-11-07'), ['Internet:em3dias:2026-11-10']);
  assert.deepEqual(quando(repo, '2026-11-08'), []);
  assert.deepEqual(quando(repo, '2026-11-10'), ['Internet:hoje:2026-11-10']);
});

test('cada lembrete sai uma vez por dia', () => {
  const repo = novo();
  cadastrarConta(repo, 'Internet', 12000, 10);
  assert.equal(lembretesDoDia(repo, '2026-11-07').length, 1);
  assert.equal(lembretesDoDia(repo, '2026-11-07').length, 0);
});

test('paga no mês não lembra; no mês seguinte volta', () => {
  const repo = novo();
  cadastrarConta(repo, 'Internet', 12000, 10);
  assert.equal(marcarPaga(repo, 'internet', '2026-11'), true);
  assert.deepEqual(quando(repo, '2026-11-10'), []);
  assert.deepEqual(quando(repo, '2026-12-07'), ['Internet:em3dias:2026-12-10']);
});

test('dia 31 em fevereiro vence no último dia', () => {
  const repo = novo();
  cadastrarConta(repo, 'Aluguel', 150000, 31);
  assert.deepEqual(quando(repo, '2027-02-28'), ['Aluguel:hoje:2027-02-28']);
  assert.deepEqual(quando(repo, '2028-02-26'), ['Aluguel:em3dias:2028-02-29']);
});

test('lembrete 3 dias antes atravessa o mês', () => {
  const repo = novo();
  cadastrarConta(repo, 'Luz', 20000, 2);
  assert.deepEqual(quando(repo, '2026-11-29'), ['Luz:em3dias:2026-12-02']);
});

test('nome com acento e caixa casa; inexistente devolve false', () => {
  const repo = novo();
  cadastrarConta(repo, 'Plano de Saúde', 45090, 5);
  assert.equal(marcarPaga(repo, 'PLANO DE SAUDE', '2026-11'), true);
  assert.equal(marcarPaga(repo, 'academia', '2026-11'), false);
});

test('cadastrar de novo atualiza valor e dia', () => {
  const repo = novo();
  cadastrarConta(repo, 'Internet', 12000, 10);
  cadastrarConta(repo, 'internet', 13000, 12);
  assert.deepEqual(proximosVencimentos(repo, '2026-11-04').map((c) => [c.nome, c.valorCentavos, c.vencimento]), [['Internet', 13000, '2026-11-12']]);
});

test('proximosVencimentos ordena e pula a paga do mês', () => {
  const repo = novo();
  cadastrarConta(repo, 'Internet', 12000, 10);
  cadastrarConta(repo, 'Luz', 20000, 2);
  marcarPaga(repo, 'luz', '2026-11');
  assert.deepEqual(proximosVencimentos(repo, '2026-11-01').map((c) => [c.nome, c.vencimento]),
    [['Internet', '2026-11-10'], ['Luz', '2026-12-02']]);
});
