/**
 * @param {{contas: import('../portas/fonte.js').ContaExterna[],
 *   movimentacoes: import('../portas/fonte.js').Movimentacao[], erro?: Error}} dados
 */
export function criarFonteFalsa({ contas = [], movimentacoes = [], erro } = {}) {
  const fonte = {
    contas,
    movimentacoes,
    erro,
    chamadas: [],
    async listarContas() {
      fonte.chamadas.push(['listarContas']);
      if (fonte.erro) throw fonte.erro;
      return fonte.contas.map((c) => ({ ...c }));
    },
    async listarMovimentacoes(contaExternaId, desde) {
      fonte.chamadas.push(['listarMovimentacoes', contaExternaId, desde]);
      if (fonte.erro) throw fonte.erro;
      return fonte.movimentacoes
        .filter((m) => m.contaExternaId === contaExternaId && m.data >= desde)
        .map((m) => ({ ...m }));
    },
  };
  return fonte;
}
