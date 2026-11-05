import { test } from 'node:test';
import assert from 'node:assert/strict';

/**
 * Contrato de FonteDeMovimentacoes. `criar` devolve uma fonte cujas
 * movimentações cobrem pelo menos duas datas distintas.
 */
export function testarContratoFonte(nome, criar) {
  test(`${nome}: contrato da FonteDeMovimentacoes`, async () => {
    const fonte = await criar();
    const contas = await fonte.listarContas();
    assert.ok(contas.length > 0, 'sem contas');
    for (const c of contas) {
      assert.ok(['cartao', 'corrente'].includes(c.tipo));
      assert.equal(typeof c.idExterno, 'string');
    }

    const ids = new Set();
    const datas = [];
    for (const c of contas) {
      for (const m of await fonte.listarMovimentacoes(c.idExterno, '1900-01-01')) {
        assert.ok(Number.isInteger(m.valorCentavos) && m.valorCentavos > 0, `valor inválido ${m.valorCentavos}`);
        assert.match(m.data, /^\d{4}-\d{2}-\d{2}$/);
        assert.ok(['entrada', 'saida'].includes(m.direcao));
        assert.equal(m.contaExternaId, c.idExterno);
        assert.ok(!ids.has(m.idExterno), `idExterno repetido ${m.idExterno}`);
        ids.add(m.idExterno);
        datas.push({ conta: c.idExterno, data: m.data });
      }
    }
    assert.ok(ids.size > 0, 'sem movimentações');

    const ordenadas = datas.map((d) => d.data).sort();
    const corte = ordenadas[ordenadas.length - 1];
    for (const c of contas) {
      for (const m of await fonte.listarMovimentacoes(c.idExterno, corte)) {
        assert.ok(m.data >= corte, `desde não filtrou: ${m.data} < ${corte}`);
      }
    }
  });
}
