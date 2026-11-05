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
