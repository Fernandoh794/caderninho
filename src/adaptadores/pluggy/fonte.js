import { criarClientePluggy } from './cliente.js';
import { mapearTransacao } from './mapear.js';

const dia = (dataISO) => (dataISO ? Number(String(dataISO).slice(8, 10)) : undefined);

/** @returns {import('../../portas/fonte.js').FonteDeMovimentacoes} */
export function criarFontePluggy({ clientId, clientSecret, itemIds, fetch = globalThis.fetch }) {
  const cliente = criarClientePluggy({ clientId, clientSecret, fetch });
  const contasPorId = new Map();

  async function listarContas() {
    const saida = [];
    for (const itemId of itemIds) {
      const item = await cliente.obter(`/items/${itemId}`);
      const banco = item.connector?.name ?? itemId;
      for (const c of await cliente.paginar('/accounts', { itemId })) {
        const cartao = c.type === 'CREDIT';
        const conta = { idExterno: c.id, tipo: cartao ? 'cartao' : 'corrente', banco, apelido: `${banco} ${c.marketingName ?? c.name}` };
        if (cartao) {
          conta.diaFechamento = dia(c.creditData?.balanceCloseDate);
          conta.diaVencimento = dia(c.creditData?.balanceDueDate);
        }
        contasPorId.set(c.id, conta);
        saida.push(conta);
      }
    }
    return saida;
  }

  async function listarMovimentacoes(contaExternaId, desde) {
    if (!contasPorId.has(contaExternaId)) await listarContas();
    const conta = contasPorId.get(contaExternaId);
    if (!conta) throw new Error(`Conta desconhecida: ${contaExternaId}`);
    const transacoes = await cliente.paginar('/transactions', { accountId: contaExternaId, from: desde });
    return transacoes
      .filter((t) => t.amount !== 0)
      .map((t) => mapearTransacao(t, conta))
      .filter((m) => m.data >= desde);
  }

  return { listarContas, listarMovimentacoes };
}
