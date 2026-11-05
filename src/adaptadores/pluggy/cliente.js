import { ErroLimite } from '../../portas/fonte.js';

const BASE = 'https://api.pluggy.ai';
const VALIDADE_TOKEN_MS = 110 * 60_000; // a apiKey vale 2h; renova antes

/** Cliente HTTP mínimo da Pluggy: autentica (reaproveitando o token) e pagina. */
export function criarClientePluggy({ clientId, clientSecret, fetch = globalThis.fetch, agora = Date.now }) {
  let token = null;
  let venceEm = 0;

  async function requisitar(caminho, init) {
    const resposta = await fetch(`${BASE}${caminho}`, init);
    if (resposta.status === 429) throw new ErroLimite(`Pluggy: HTTP 429 em ${caminho}`);
    return resposta;
  }

  async function autenticar() {
    const r = await requisitar('/auth', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ clientId, clientSecret }),
    });
    if (!r.ok) throw new Error(`Pluggy: falha na autenticação (HTTP ${r.status})`);
    token = (await r.json()).apiKey;
    venceEm = agora() + VALIDADE_TOKEN_MS;
  }

  async function obter(caminho, params = {}, jaRenovou = false) {
    if (!token || agora() >= venceEm) await autenticar();
    const qs = new URLSearchParams(params).toString();
    const r = await requisitar(qs ? `${caminho}?${qs}` : caminho, { headers: { 'X-API-KEY': token } });
    if (r.status === 401 && !jaRenovou) {
      token = null;
      return obter(caminho, params, true);
    }
    if (!r.ok) throw new Error(`Pluggy: HTTP ${r.status} em ${caminho}`);
    return r.json();
  }

  async function paginar(caminho, params = {}) {
    const itens = [];
    for (let pagina = 1; ; pagina++) {
      const r = await obter(caminho, { ...params, pageSize: 500, page: pagina });
      itens.push(...r.results);
      if (pagina >= (r.totalPages ?? 1)) return itens;
    }
  }

  return { obter, paginar };
}
