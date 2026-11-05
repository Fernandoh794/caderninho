import { dividirCentavos, formatarReais } from './dinheiro.js';

const SAIDAS_DE_CONTA = new Set(['pix', 'debito']);

/**
 * Seu gasto real no mês, por categoria: saídas de conta (Pix, débito) mais
 * a sua parte das compras de cartão, menos a sua parte dos estornos.
 * Transferências, pagamento de fatura e entradas nunca contam.
 * @returns {Map<string, number>} centavos por categoria
 */
export function gastoRealPorCategoria(repo, mes, euId) {
  const gasto = new Map();
  const somar = (categoria, centavos) => gasto.set(categoria, (gasto.get(categoria) ?? 0) + centavos);

  for (const m of repo.listarMovimentacoes({ mesDe: mes })) {
    if (m.status !== 'classificada' || !m.categoria) continue;
    if (m.direcao === 'saida' && SAIDAS_DE_CONTA.has(m.tipo) && m.contaTipo !== 'cartao') {
      somar(m.categoria, m.valorCentavos);
      continue;
    }
    if (m.tipo === 'compra_cartao' || m.tipo === 'estorno') {
      const atribuicoes = repo.atribuicoesDe(m.id);
      if (!atribuicoes.length) continue;
      const minha = dividirCentavos(m.valorCentavos, atribuicoes, euId).find((p) => p.pessoaId === euId)?.centavos ?? 0;
      if (minha) somar(m.categoria, m.tipo === 'estorno' ? -minha : minha);
    }
  }
  return gasto;
}

/** Texto do !gastos: gasto por categoria e saldo de cada orçamento. */
export function textoGastos(mapa, orcamentos = [], mes) {
  const limites = new Map(orcamentos.map((o) => [o.categoria, o.limiteCentavos]));
  const categorias = new Set([...mapa.keys(), ...limites.keys()]);
  const linhas = [...categorias]
    .map((c) => ({ c, g: mapa.get(c) ?? 0 }))
    .sort((a, b) => b.g - a.g)
    .map(({ c, g }) => {
      const limite = limites.get(c);
      if (limite == null) return `${c}: ${formatarReais(g)}`;
      const saldo = limite - g;
      const situacao = saldo >= 0 ? `faltam ${formatarReais(saldo)}` : `estourou ${formatarReais(-saldo)}`;
      return `${c}: ${formatarReais(g)} de ${formatarReais(limite)} (${situacao})`;
    });
  const total = [...mapa.values()].reduce((s, v) => s + v, 0);
  if (!linhas.length) return `Nenhum gasto registrado${mes ? ` em ${mes}` : ''}.`;
  return `Seus gastos${mes ? ` em ${mes}` : ''}:\n${linhas.join('\n')}\nTotal: ${formatarReais(total)}`;
}
