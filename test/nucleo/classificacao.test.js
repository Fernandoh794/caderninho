import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decidir } from '../../src/nucleo/classificacao.js';

const ctx = (extra = {}) => ({ memoria: () => null, grupos: [], nomesProprios: ['Fernando Souza'], ...extra });
const m = (extra) => ({ direcao: 'saida', tipo: 'pix', descricao: 'X', estabelecimentoNorm: 'x', valorCentavos: 100, ...extra });

test('pagamento de fatura é transferência', () => {
  assert.deepEqual(decidir(m({ tipo: 'pagamento_fatura' }), ctx()), { acao: 'transferencia' });
});
test('pix/transferência para nome próprio é transferência', () => {
  assert.deepEqual(decidir(m({ tipo: 'transferencia', descricao: 'TED FERNANDO SOUZA' }), ctx()), { acao: 'transferencia' });
  assert.deepEqual(decidir(m({ tipo: 'pix', direcao: 'entrada', descricao: 'Pix recebido Fernando Souza' }), ctx()), { acao: 'transferencia' });
});
test('parcela com grupo herda', () => {
  const grupos = [{ id: 3, estabelecimentoNorm: 'loja', valorTotalCentavos: 600, totalParcelas: 6, ultimaParcela: 1 }];
  assert.deepEqual(decidir(m({ tipo: 'compra_cartao', estabelecimentoNorm: 'loja', parcelaAtual: 2, totalParcelas: 6, valorTotalCentavos: 600 }), ctx({ grupos })),
    { acao: 'herdar', grupoId: 3 });
});
test('pix com memória é categorizado', () => {
  assert.deepEqual(decidir(m({ estabelecimentoNorm: 'mercado sj' }), ctx({ memoria: () => 'mercado' })), { acao: 'categorizar', categoria: 'mercado' });
});
test('compra de cartão com memória fica pendente com sugestão (dono ainda é perguntado)', () => {
  assert.deepEqual(decidir(m({ tipo: 'compra_cartao' }), ctx({ memoria: () => 'lazer' })), { acao: 'pendente', sugestaoCategoria: 'lazer' });
});
test('compra de cartão sem memória fica pendente', () => {
  assert.deepEqual(decidir(m({ tipo: 'compra_cartao' }), ctx()), { acao: 'pendente' });
});
test('entrada e estorno ficam pendentes', () => {
  assert.equal(decidir(m({ direcao: 'entrada' }), ctx({ memoria: () => 'mercado' })).acao, 'pendente');
  assert.equal(decidir(m({ tipo: 'estorno', direcao: 'entrada' }), ctx()).acao, 'pendente');
});
