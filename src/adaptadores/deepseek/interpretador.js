import { normalizar } from '../../interpretacao/parser.js';

const URL_DEEPSEEK = 'https://api.deepseek.com/chat/completions';
const INVALIDO = Object.freeze({ tipo: 'invalido', motivo: 'desconhecido' });

const INSTRUCOES = `Você interpreta respostas curtas, em português do Brasil, sobre de quem é uma compra e a categoria dela.
Responda SOMENTE um objeto JSON em um destes formatos:
{"tipo":"atribuicao","partes":[{"pessoa":"<nome da lista>","percentual":<número>}],"categoria":"<categoria da lista ou omita>"}
{"tipo":"categoria","categoria":"<categoria da lista>"}
{"tipo":"entrada","classe":"renda"|"reembolso"}
{"tipo":"desconhecido"}
Regras: use apenas pessoas e categorias das listas; os percentuais somam 100; "eu", "meu", "minha" referem-se à pessoa marcada como dono; na dúvida, "desconhecido".`;

/**
 * Adaptador DeepSeek da porta Interpretador. Envia só o texto da resposta,
 * o nome do estabelecimento e as listas de pessoas e categorias; nunca
 * valores, datas ou cartão. Todo resultado precisa de confirmação.
 */
export function criarInterpretadorDeepSeek({ apiKey, modelo = 'deepseek-chat', fetch = globalThis.fetch }) {
  async function perguntar(mensagemUsuario) {
    try {
      const resposta = await fetch(URL_DEEPSEEK, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: modelo,
          temperature: 0,
          response_format: { type: 'json_object' },
          messages: [{ role: 'system', content: INSTRUCOES }, { role: 'user', content: mensagemUsuario }],
        }),
        signal: AbortSignal.timeout(30_000),
      });
      if (resposta.status !== 200) return null;
      const corpo = await resposta.json();
      return JSON.parse(corpo?.choices?.[0]?.message?.content ?? '');
    } catch {
      return null;
    }
  }

  const acharCategoria = (nome, categorias) => categorias.find((c) => normalizar(c) === normalizar(nome)) ?? null;
  const acharPessoa = (nome, pessoas) => pessoas.find((p) => [p.nome, ...p.apelidos].some((n) => normalizar(n) === normalizar(nome))) ?? null;

  function validar(json, { pessoas, categorias }) {
    if (!json || typeof json !== 'object') return INVALIDO;
    if (json.tipo === 'categoria') {
      const categoria = acharCategoria(json.categoria, categorias);
      return categoria ? { tipo: 'categoria', categoria, precisaConfirmar: true } : INVALIDO;
    }
    if (json.tipo === 'entrada') {
      return ['renda', 'reembolso'].includes(json.classe) ? { tipo: 'entrada', classe: json.classe, precisaConfirmar: true } : INVALIDO;
    }
    if (json.tipo !== 'atribuicao' || !Array.isArray(json.partes) || json.partes.length === 0) return INVALIDO;

    const partes = [];
    for (const p of json.partes) {
      const pessoa = acharPessoa(p?.pessoa, pessoas);
      const bp = Math.round(Number(p?.percentual) * 100);
      if (!pessoa || !Number.isFinite(bp) || bp <= 0 || partes.some((x) => x.pessoaId === pessoa.id)) return INVALIDO;
      partes.push({ pessoaId: pessoa.id, bp });
    }
    if (partes.reduce((s, p) => s + p.bp, 0) !== 10000) return INVALIDO;
    const r = { tipo: 'atribuicao', partes };
    if (json.categoria) {
      const categoria = acharCategoria(json.categoria, categorias);
      if (!categoria) return INVALIDO;
      r.categoria = categoria;
    }
    r.precisaConfirmar = true;
    return r;
  }

  return {
    async interpretar(texto, { estabelecimento, pessoas, categorias }) {
      const lista = pessoas.map((p) => `${p.nome}${p.ehEu ? ' (dono)' : ''}${p.apelidos.length ? ` [apelidos: ${p.apelidos.join(', ')}]` : ''}`);
      const json = await perguntar(JSON.stringify({
        resposta: texto,
        estabelecimento: estabelecimento ?? null,
        pessoas: lista,
        categorias,
      }));
      return validar(json, { pessoas, categorias });
    },
    async sugerirCategoria(estabelecimento, categorias) {
      const json = await perguntar(JSON.stringify({
        tarefa: 'Sugira a categoria mais provável para este estabelecimento. Responda {"categoria":"<da lista>"} ou {"categoria":null}.',
        estabelecimento,
        categorias,
      }));
      return json?.categoria ? acharCategoria(json.categoria, categorias) : null;
    },
  };
}
