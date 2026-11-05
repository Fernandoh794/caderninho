export function criarMensageiroFalso() {
  let seq = 0;
  const ouvintes = [];
  const m = {
    enviadas: [],
    aoReceber(cb) { ouvintes.push(cb); },
    async enviar(texto) {
      const id = `bot-${++seq}`;
      m.enviadas.push({ id, texto });
      return { id };
    },
    /** Entrega uma mensagem a todos os ouvintes e espera eles terminarem. */
    async simular(msg) {
      for (const cb of ouvintes) await cb(msg);
    },
    ultima() { return m.enviadas.at(-1)?.texto; },
  };
  return m;
}
