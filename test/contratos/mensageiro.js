import { test } from 'node:test';
import assert from 'node:assert/strict';

/**
 * Contrato do Mensageiro. `criar` devolve `{mensageiro, simularRecebida(msg)}`.
 */
export function testarContratoMensageiro(nome, criar) {
  test(`${nome}: contrato do Mensageiro`, async () => {
    const { mensageiro, simularRecebida } = await criar();
    const recebidas = [];
    mensageiro.aoReceber((m) => recebidas.push(m));
    await simularRecebida({ id: 'm1', deJid: 'x@s.whatsapp.net', texto: 'oi' });
    assert.equal(recebidas.length, 1);
    assert.equal(recebidas[0].texto, 'oi');

    const a = await mensageiro.enviar('um');
    const b = await mensageiro.enviar('dois');
    assert.equal(typeof a.id, 'string');
    assert.notEqual(a.id, b.id);
  });
}
