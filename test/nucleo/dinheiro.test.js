import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dividirCentavos, formatarReais } from '../../src/nucleo/dinheiro.js';

const soma = (r) => r.reduce((s, p) => s + p.centavos, 0);

test('uma pessoa recebe tudo', () => {
  assert.deepEqual(dividirCentavos(1000, [{ pessoaId: 1, bp: 10000 }], 1), [{ pessoaId: 1, centavos: 1000 }]);
});

test('1 centavo 50/50: sobra vai para a pessoa da sobra', () => {
  const r = dividirCentavos(1, [{ pessoaId: 2, bp: 5000 }, { pessoaId: 1, bp: 5000 }], 1);
  assert.deepEqual(r.find((p) => p.pessoaId === 1).centavos, 1);
  assert.deepEqual(r.find((p) => p.pessoaId === 2).centavos, 0);
});

test('R$ 10,00 em três partes soma exatamente o total', () => {
  const r = dividirCentavos(1000, [{ pessoaId: 1, bp: 3334 }, { pessoaId: 2, bp: 3333 }, { pessoaId: 3, bp: 3333 }], 1);
  assert.equal(soma(r), 1000);
});

test('sobra para pessoa fora da divisão entra como parte própria', () => {
  const r = dividirCentavos(1, [{ pessoaId: 2, bp: 5000 }, { pessoaId: 3, bp: 5000 }], 1);
  assert.equal(soma(r), 1);
  assert.equal(r.find((p) => p.pessoaId === 1).centavos, 1);
});

test('bp que não somam 10000 lançam erro', () => {
  assert.throws(() => dividirCentavos(1000, [{ pessoaId: 1, bp: 6000 }, { pessoaId: 2, bp: 6000 }], 1), /10000/);
});

test('formatarReais', () => {
  assert.equal(formatarReais(5590), 'R$ 55,90');
  assert.equal(formatarReais(100000), 'R$ 1.000,00');
  assert.equal(formatarReais(5), 'R$ 0,05');
  assert.equal(formatarReais(-3000), '-R$ 30,00');
});
