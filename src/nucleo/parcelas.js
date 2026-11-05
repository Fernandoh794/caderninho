/**
 * Acha o grupo de parcelas ao qual uma parcela pertence. Exige mesmo
 * estabelecimento, mesmo valor total, mesmo número de parcelas e sequência
 * exata (parcelaAtual === ultimaParcela + 1). A parcela 1 nunca casa:
 * ela abre um grupo novo ao ser classificada.
 * @returns {number|null}
 */
export function acharGrupoParcelas(mov, grupos) {
  const { parcelaAtual, totalParcelas, valorTotalCentavos, estabelecimentoNorm } = mov;
  if (!parcelaAtual || !totalParcelas || !valorTotalCentavos || parcelaAtual < 2) return null;
  const g = grupos.find((g) =>
    g.estabelecimentoNorm === estabelecimentoNorm &&
    g.valorTotalCentavos === valorTotalCentavos &&
    g.totalParcelas === totalParcelas &&
    g.ultimaParcela + 1 === parcelaAtual);
  return g ? g.id : null;
}
