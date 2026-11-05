import pino from 'pino';
import { carregarConfig } from './config.js';
import { abrirBanco } from './db/abrir.js';
import { criarRepositorio } from './db/repositorio.js';
import { criarBot } from './bot.js';
import { executarComando } from './comandos.js';
import { sincronizar } from './jobs/sync.js';
import { criarAgendador, dataLocal } from './jobs/agendador.js';
import { comEspera, criarMonitorSync, avisoConsentimento, textoPendencias } from './jobs/saude.js';
import { verificarFaturas, textoAviso } from './nucleo/fatura.js';
import { avisosDeOrcamento, textoAvisoOrcamento } from './nucleo/orcamento.js';
import { lembretesDoDia } from './nucleo/contas.js';
import { formatarReais } from './nucleo/dinheiro.js';
import { criarFontePluggy } from './adaptadores/pluggy/fonte.js';
import { criarTranscritorGroq } from './adaptadores/groq/transcritor.js';
import { criarInterpretadorDeepSeek } from './adaptadores/deepseek/interpretador.js';
import { criarMensageiroBaileys } from './adaptadores/baileys/mensageiro.js';

const PESSOAS_INICIAIS = [
  { nome: 'eu', apelidos: ['meu', 'minha', 'mim'], ehEu: true },
  { nome: 'mãe', apelidos: ['mamãe', 'mae', 'mamae'] },
  { nome: 'irmão', apelidos: ['mano'] },
  { nome: 'irmã', apelidos: ['mana'] },
];

const logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  redact: { paths: ['*.apiKey', '*.clientSecret', '*.clientId', 'apiKey', 'clientSecret', 'headers.Authorization', 'audio', '*.audio', 'buffer'], censor: '[redigido]' },
});

const config = carregarConfig();
const repo = criarRepositorio(abrirBanco(config.dbPath));
if (repo.listarPessoas().length === 0) for (const p of PESSOAS_INICIAIS) repo.criarPessoa(p);
if (config.consentimentoVenceEm && !repo.obterEstado('consentimentoVenceEm')) repo.definirEstado('consentimentoVenceEm', config.consentimentoVenceEm);
const euId = repo.pessoaEu().id;
const hoje = () => dataLocal(new Date()).data;

const fonte = criarFontePluggy(config.pluggy);
const mensageiro = criarMensageiroBaileys({ authDir: config.authDir, dono: config.dono, logger });
const enviar = (texto) => mensageiro.enviar(texto).catch((err) => logger.error({ err }, 'falha ao enviar'));

async function avisarOrcamento() {
  for (const a of avisosDeOrcamento(repo, hoje().slice(0, 7), euId)) await enviar(textoAvisoOrcamento(a));
}

const bot = criarBot({
  repo, mensageiro, logger,
  transcritor: criarTranscritorGroq({ apiKey: config.groq.apiKey }),
  interpretador: criarInterpretadorDeepSeek({ apiKey: config.deepseek.apiKey, modelo: config.deepseek.modelo }),
  agora: hoje,
  comandos: async (nome, args) => executarComando(nome, args, { repo, hoje: hoje(), euId }),
  aposGravar: avisarOrcamento,
});

const monitor = criarMonitorSync({ aviso: enviar });

async function tarefaSync() {
  try {
    const r = await comEspera(() => sincronizar({ fonte, repo, hoje: hoje(), nomesProprios: config.nomesProprios }), { tentativas: 3, baseMs: 30_000 });
    monitor.sucesso();
    logger.info(r, 'sync concluído');
    if (config.heartbeatUrl) await fetch(config.heartbeatUrl, { signal: AbortSignal.timeout(10_000) }).catch(() => {});
  } catch (erro) {
    logger.warn({ err: erro }, 'sync falhou');
    await monitor.falha(erro);
  }
  await avisarOrcamento();
  await bot.perguntarPendentes();
}

async function tarefaDiaria(data) {
  const pend = textoPendencias(repo.listarPendentes().length);
  if (pend) await enviar(pend);
  const pessoas = repo.listarPessoas();
  for (const a of verificarFaturas(repo, data, euId)) await enviar(textoAviso(a, pessoas));
  await avisarOrcamento();
  for (const l of lembretesDoDia(repo, data)) {
    const venc = `${l.vencimento.slice(8, 10)}/${l.vencimento.slice(5, 7)}`;
    await enviar(l.quando === 'hoje'
      ? `Hoje vence ${l.nome} (${formatarReais(l.valorCentavos)}). Quando pagar, responda "paguei ${l.nome}".`
      : `Lembrete: ${l.nome} (${formatarReais(l.valorCentavos)}) vence em 3 dias, ${venc}.`);
  }
  const consentimento = avisoConsentimento(repo.obterEstado('consentimentoVenceEm'), data);
  if (consentimento) await enviar(consentimento);
}

const agendador = criarAgendador({
  tarefas: { sync: tarefaSync, diario: tarefaDiaria },
  aoFalhar: (tarefa, err) => logger.error({ err, tarefa }, 'tarefa falhou'),
});

await mensageiro.iniciar();
await mensageiro.aguardarConexao();
agendador.iniciar();
logger.info('caderninho no ar');

for (const sinal of ['SIGINT', 'SIGTERM']) {
  process.on(sinal, () => {
    agendador.parar();
    mensageiro.parar();
    repo.db.close();
    process.exit(0);
  });
}
