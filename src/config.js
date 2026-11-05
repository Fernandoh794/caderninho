const OBRIGATORIAS = ['PLUGGY_CLIENT_ID', 'PLUGGY_CLIENT_SECRET', 'PLUGGY_ITEM_IDS', 'GROQ_API_KEY', 'DEEPSEEK_API_KEY', 'DONO_JID'];

const lista = (v) => (v ?? '').split(',').map((s) => s.trim()).filter(Boolean);

/** Lê e valida a configuração do ambiente. Falha nomeando o que falta. */
export function carregarConfig(env = process.env) {
  const faltando = OBRIGATORIAS.filter((k) => !env[k]?.trim());
  if (faltando.length) throw new Error(`variáveis de ambiente obrigatórias ausentes: ${faltando.join(', ')}`);
  if (env.CONSENTIMENTO_VENCE_EM && !/^\d{4}-\d{2}-\d{2}$/.test(env.CONSENTIMENTO_VENCE_EM)) {
    throw new Error('CONSENTIMENTO_VENCE_EM precisa estar no formato AAAA-MM-DD');
  }
  return {
    pluggy: { clientId: env.PLUGGY_CLIENT_ID, clientSecret: env.PLUGGY_CLIENT_SECRET, itemIds: lista(env.PLUGGY_ITEM_IDS) },
    groq: { apiKey: env.GROQ_API_KEY },
    deepseek: { apiKey: env.DEEPSEEK_API_KEY, modelo: env.DEEPSEEK_MODEL || 'deepseek-chat' },
    dono: { jid: env.DONO_JID, lid: env.DONO_LID || undefined },
    nomesProprios: lista(env.NOMES_PROPRIOS),
    dbPath: env.DB_PATH || './caderninho.db',
    authDir: env.AUTH_DIR || './auth',
    heartbeatUrl: env.HEARTBEAT_URL || null,
    consentimentoVenceEm: env.CONSENTIMENTO_VENCE_EM || null,
  };
}
