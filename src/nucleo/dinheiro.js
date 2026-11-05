/**
 * Divide um valor em centavos por pontos-base. A sobra de arredondamento
 * vai para `pessoaSobraId`, de modo que a soma sempre bate com o total.
 * @param {number} totalCentavos
 * @param {{pessoaId: number, bp: number}[]} partes
 * @param {number} pessoaSobraId
 * @returns {{pessoaId: number, centavos: number}[]}
 */
export function dividirCentavos(totalCentavos, partes, pessoaSobraId) {
  const somaBp = partes.reduce((s, p) => s + p.bp, 0);
  if (somaBp !== 10000) throw new Error(`a soma dos percentuais deve ser 10000 bp, veio ${somaBp}`);

  const resultado = partes.map((p) => ({ pessoaId: p.pessoaId, centavos: Math.floor((totalCentavos * p.bp) / 10000) }));
  const sobra = totalCentavos - resultado.reduce((s, p) => s + p.centavos, 0);
  if (sobra !== 0) {
    const alvo = resultado.find((p) => p.pessoaId === pessoaSobraId);
    if (alvo) alvo.centavos += sobra;
    else resultado.push({ pessoaId: pessoaSobraId, centavos: sobra });
  }
  return resultado;
}

const FORMATO = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** @param {number} centavos */
export function formatarReais(centavos) {
  const sinal = centavos < 0 ? '-' : '';
  return `${sinal}R$ ${FORMATO.format(Math.abs(centavos) / 100)}`;
}
