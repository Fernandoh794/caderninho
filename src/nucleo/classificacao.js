import { acharGrupoParcelas } from './parcelas.js';
import { normalizarEstabelecimento } from './estabelecimento.js';

/**
 * @typedef {{acao: 'transferencia'} | {acao: 'herdar', grupoId: number}
 *   | {acao: 'categorizar', categoria: string} | {acao: 'pendente', sugestaoCategoria?: string}} Decisao
 */

function ehParaSiMesmo(mov, nomesProprios) {
  if (!['pix', 'transferencia', 'debito'].includes(mov.tipo)) return false;
  const desc = normalizarEstabelecimento(mov.descricao);
  return nomesProprios.some((n) => {
    const nome = normalizarEstabelecimento(n);
    return nome.length > 0 && desc.includes(nome);
  });
}

/**
 * Decide o destino de uma movimentação nova. Puro: sem banco, sem rede.
 * @param {object} mov Movimentacao + estabelecimentoNorm
 * @param {{memoria: (estabNorm: string) => string|null, grupos: object[], nomesProprios: string[]}} ctx
 * @returns {Decisao}
 */
export function decidir(mov, { memoria, grupos, nomesProprios }) {
  if (mov.tipo === 'pagamento_fatura') return { acao: 'transferencia' };
  if (ehParaSiMesmo(mov, nomesProprios)) return { acao: 'transferencia' };
  if (mov.direcao === 'entrada') return { acao: 'pendente' }; // renda, reembolso ou estorno: sempre pergunta

  const grupoId = acharGrupoParcelas(mov, grupos);
  if (grupoId != null) return { acao: 'herdar', grupoId };

  const categoria = memoria(mov.estabelecimentoNorm);
  if (mov.tipo === 'compra_cartao') return categoria ? { acao: 'pendente', sugestaoCategoria: categoria } : { acao: 'pendente' };
  if (categoria) return { acao: 'categorizar', categoria };
  return { acao: 'pendente' };
}
