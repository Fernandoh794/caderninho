import { ErroAutorizacao } from '../../portas/fonte.js';
import { criarClientePluggy } from './cliente.js';
import { mapearTransacao } from './mapear.js';

const VALIDADE_CACHE_MS = 24 * 3_600_000;
const dia = (dataISO) => (dataISO ? Number(String(dataISO).slice(8, 10)) : undefined);

/** @returns {import('../../portas/fonte.js').FonteDeMovimentacoes} */
export function criarFontePluggy({ clientId, clientSecret, itemIds, fetch = globalThis.fetch, agora = Date.now }) {
  const cliente = criarClientePluggy({ clientId, clientSecret, fetch, agora });
  const contasPorId = new Map();
  const consentimentos = new Map(); // itemId -> timestamp de vencimento
  let contas = null;
  let carregadoEm = 0;

  // Barato: usa só o que já veio do item, sem chamar a API.
  function conferirConsentimento() {
    for (const [itemId, venceEm] of consentimentos) {
      if (agora() >= venceEm) throw new ErroAutorizacao(`consentimento do item ${itemId} venceu`);
    }
  }

  async function carregar() {
    const saida = [];
    for (const itemId of itemIds) {
      const item = await cliente.obter(`/items/${itemId}`);
      if (item.status === 'LOGIN_ERROR') throw new ErroAutorizacao(`item ${itemId} em LOGIN_ERROR: reconectar no Meu Pluggy`);
      if (item.consentExpiresAt) consentimentos.set(itemId, Date.parse(item.consentExpiresAt));
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
    contas = saida;
    carregadoEm = agora();
  }

  async function listarContas() {
    conferirConsentimento();
    if (!contas || agora() - carregadoEm >= VALIDADE_CACHE_MS) await carregar();
    return contas;
  }

  async function listarMovimentacoes(contaExternaId, desde) {
    await listarContas();
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
