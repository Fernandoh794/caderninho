export function criarInterpretadorFalso({ resultado = { tipo: 'invalido', motivo: 'desconhecido' }, sugestao = null } = {}) {
  const i = {
    resultado, sugestao, chamadas: [],
    async interpretar(texto, contexto) {
      i.chamadas.push({ texto, contexto });
      if (i.resultado.tipo === 'invalido') return { ...i.resultado };
      return { ...i.resultado, precisaConfirmar: true };
    },
    async sugerirCategoria(estabelecimento, categorias) {
      i.chamadas.push({ estabelecimento, categorias });
      return i.sugestao;
    },
  };
  return i;
}
