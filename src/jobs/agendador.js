const INTERVALO_SYNC_MS = 2 * 60 * 60 * 1000;
const HORA_DIARIO = 9;
const FUSO = 'America/Sao_Paulo';

const FORMATO = new Intl.DateTimeFormat('en-CA', { timeZone: FUSO, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

/** Data (AAAA-MM-DD), hora e minuto em America/Sao_Paulo. */
export function dataLocal(instante) {
  const p = Object.fromEntries(FORMATO.formatToParts(instante).map((x) => [x.type, x.value]));
  return { data: `${p.year}-${p.month}-${p.day}`, hora: Number(p.hour), minuto: Number(p.minute) };
}

/**
 * Dispara `sync` a cada 2 horas (e na partida) e `diario(data)` uma vez por
 * dia a partir das 09:00 de São Paulo. Uma tarefa nunca roda em paralelo
 * consigo mesma; falha é reportada e não derruba o agendador.
 */
export function criarAgendador({ relogio = { agora: () => new Date() }, tarefas, aoFalhar = () => {}, intervaloMs = 60_000 }) {
  let ultimoSync = null;
  let ultimoDiario = null;
  let rodando = false;
  let timer = null;

  async function executar(nome, ...args) {
    try {
      await tarefas[nome](...args);
    } catch (erro) {
      aoFalhar(nome, erro);
    }
  }

  async function verificar() {
    if (rodando) return;
    rodando = true;
    try {
      const agora = relogio.agora();
      if (ultimoSync === null || agora.getTime() - ultimoSync >= INTERVALO_SYNC_MS) {
        ultimoSync = agora.getTime();
        await executar('sync');
      }
      const { data, hora } = dataLocal(agora);
      if (hora >= HORA_DIARIO && ultimoDiario !== data) {
        ultimoDiario = data;
        await executar('diario', data);
      }
    } finally {
      rodando = false;
    }
  }

  return {
    verificar,
    iniciar() {
      verificar();
      timer = setInterval(verificar, intervaloMs);
    },
    parar() { clearInterval(timer); },
  };
}
