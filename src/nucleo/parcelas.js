/**
 * Acha o grupo de parcelas ao qual uma parcela pertence. Exige mesmo
 * estabelecimento, mesmo número de parcelas e sequência exata
 * (parcelaAtual === ultimaParcela + 1). Se a fonte informa o valor total, ele
 * deve ser igual ao do grupo; se não informa (comum no Open Finance), vale o
 * valor da parcela, com tolerância de centavos de arredondamento
 * (|parcela * N - total do grupo| <= N). A parcela 1 nunca casa: ela abre um
 * grupo novo ao ser classificada.
 * @returns {number|null}
 */
export function acharGrupoParcelas(mov, grupos) {
  const { parcelaAtual, totalParcelas, valorTotalCentavos, valorCentavos, estabelecimentoNorm } = mov;
  if (!parcelaAtual || !totalParcelas || parcelaAtual < 2) return null;
  if (!valorTotalCentavos && !valorCentavos) return null;
  const mesmoValor = (g) => valorTotalCentavos
    ? g.valorTotalCentavos === valorTotalCentavos
    : Math.abs(valorCentavos * totalParcelas - g.valorTotalCentavos) <= totalParcelas;
  const g = grupos.find((g) =>
    g.estabelecimentoNorm === estabelecimentoNorm &&
    mesmoValor(g) &&
    g.totalParcelas === totalParcelas &&
    g.ultimaParcela + 1 === parcelaAtual);
  return g ? g.id : null;
}
