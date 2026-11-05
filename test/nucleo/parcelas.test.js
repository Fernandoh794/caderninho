import { test } from 'node:test';
import assert from 'node:assert/strict';
import { acharGrupoParcelas } from '../../src/nucleo/parcelas.js';

const grupo = { id: 7, estabelecimentoNorm: 'loja x', valorTotalCentavos: 60000, totalParcelas: 6, ultimaParcela: 1 };
const mov = (extra) => ({ estabelecimentoNorm: 'loja x', valorTotalCentavos: 60000, totalParcelas: 6, ...extra });

test('parcela seguinte do mesmo grupo herda', () => {
  assert.equal(acharGrupoParcelas(mov({ parcelaAtual: 2 }), [grupo]), 7);
});
test('valor total diferente não casa', () => {
  assert.equal(acharGrupoParcelas(mov({ parcelaAtual: 2, valorTotalCentavos: 59000 }), [grupo]), null);
});
test('parcela 1 abre grupo novo', () => {
  assert.equal(acharGrupoParcelas(mov({ parcelaAtual: 1 }), [grupo]), null);
});
test('parcela fora de sequência não casa', () => {
  assert.equal(acharGrupoParcelas(mov({ parcelaAtual: 3 }), [grupo]), null);
});
test('sem campos de parcela', () => {
  assert.equal(acharGrupoParcelas({ estabelecimentoNorm: 'loja x' }, [grupo]), null);
});
test('estabelecimento diferente ou total de parcelas diferente não casa', () => {
  assert.equal(acharGrupoParcelas(mov({ parcelaAtual: 2, estabelecimentoNorm: 'outra' }), [grupo]), null);
  assert.equal(acharGrupoParcelas(mov({ parcelaAtual: 2, totalParcelas: 10 }), [grupo]), null);
});

// Open Finance costuma não informar o valor total: o grupo vale pelo valor da parcela.
const semTotal = (extra) => ({ estabelecimentoNorm: 'loja x', totalParcelas: 6, valorCentavos: 10000, ...extra });

test('sem valor total, casa pelo valor da parcela', () => {
  assert.equal(acharGrupoParcelas(semTotal({ parcelaAtual: 2 }), [grupo]), 7);
});
test('sem valor total, tolera diferença de centavos de arredondamento', () => {
  assert.equal(acharGrupoParcelas(semTotal({ parcelaAtual: 2, valorCentavos: 10001 }), [grupo]), 7);
});
test('sem valor total, parcela de outro valor não casa', () => {
  assert.equal(acharGrupoParcelas(semTotal({ parcelaAtual: 2, valorCentavos: 5000 }), [grupo]), null);
});
test('sem valor total e sem valor da parcela não há como casar', () => {
  assert.equal(acharGrupoParcelas({ estabelecimentoNorm: 'loja x', totalParcelas: 6, parcelaAtual: 2 }, [grupo]), null);
});
