const ultimoDia = (ano, mes) => new Date(Date.UTC(ano, mes, 0)).getUTCDate(); // mes 1..12

/**
 * Mês de referência ('AAAA-MM') da fatura em que uma compra cai: compras
 * depois do dia de fechamento vão para a fatura do mês seguinte. Fechamento
 * em dia que o mês não tem (31 em fevereiro) cai no último dia do mês.
 */
export function faturaRefDe(dataISO, diaFechamento) {
  const [ano, mes, dia] = dataISO.split('-').map(Number);
  const fechamento = Math.min(diaFechamento, ultimoDia(ano, mes));
  if (dia <= fechamento) return `${ano}-${String(mes).padStart(2, '0')}`;
  const proximo = mes === 12 ? [ano + 1, 1] : [ano, mes + 1];
  return `${proximo[0]}-${String(proximo[1]).padStart(2, '0')}`;
}
