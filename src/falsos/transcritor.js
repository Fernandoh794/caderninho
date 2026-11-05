export function criarTranscritorFalso({ texto = '', erro } = {}) {
  const t = {
    texto, erro, chamadas: [],
    async transcrever(audio, mime) {
      t.chamadas.push({ tamanho: audio.length, mime });
      if (t.erro) throw t.erro;
      return t.texto;
    },
  };
  return t;
}
