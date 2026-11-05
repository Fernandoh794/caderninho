// Spike descartável (Task 1): baixa dados reais da Pluggy para descobrir o formato.
// Uso: node --env-file=.env spike/pluggy.js
// Saída bruta (com dados pessoais) em spike/saida/, ignorada pelo git.
import { mkdir, writeFile } from 'node:fs/promises';

const BASE = 'https://api.pluggy.ai';
const { PLUGGY_CLIENT_ID, PLUGGY_CLIENT_SECRET, PLUGGY_ITEM_IDS } = process.env;
if (!PLUGGY_CLIENT_ID || !PLUGGY_CLIENT_SECRET || !PLUGGY_ITEM_IDS) {
  console.error('Faltam PLUGGY_CLIENT_ID, PLUGGY_CLIENT_SECRET ou PLUGGY_ITEM_IDS no .env');
  process.exit(1);
}

async function chamar(caminho, { apiKey, metodo = 'GET', corpo } = {}) {
  const resposta = await fetch(`${BASE}${caminho}`, {
    method: metodo,
    headers: { 'content-type': 'application/json', ...(apiKey && { 'X-API-KEY': apiKey }) },
    body: corpo && JSON.stringify(corpo),
  });
  if (!resposta.ok) throw new Error(`${metodo} ${caminho} -> HTTP ${resposta.status}: ${await resposta.text()}`);
  return resposta.json();
}

const { apiKey } = await chamar('/auth', { metodo: 'POST', corpo: { clientId: PLUGGY_CLIENT_ID, clientSecret: PLUGGY_CLIENT_SECRET } });

const desde = new Date(Date.now() - 90 * 86_400_000).toISOString().slice(0, 10);
await mkdir('spike/saida', { recursive: true });
const resumo = [];

for (const itemId of PLUGGY_ITEM_IDS.split(',').map((s) => s.trim()).filter(Boolean)) {
  const item = await chamar(`/items/${itemId}`, { apiKey });
  await writeFile(`spike/saida/item-${itemId}.json`, JSON.stringify(item, null, 2));
  const { results: contas } = await chamar(`/accounts?itemId=${itemId}`, { apiKey });
  await writeFile(`spike/saida/contas-${itemId}.json`, JSON.stringify(contas, null, 2));

  for (const conta of contas) {
    const transacoes = [];
    for (let pagina = 1; ; pagina++) {
      const r = await chamar(`/transactions?accountId=${conta.id}&from=${desde}&pageSize=500&page=${pagina}`, { apiKey });
      transacoes.push(...r.results);
      if (pagina >= r.totalPages) break;
    }
    await writeFile(`spike/saida/transacoes-${conta.id}.json`, JSON.stringify(transacoes, null, 2));
    resumo.push({
      banco: item.connector?.name,
      status: item.status,
      consentimentoVence: item.consentExpiresAt ?? null,
      tipo: `${conta.type}/${conta.subtype}`,
      conta: conta.name,
      transacoes: transacoes.length,
      comParcelas: transacoes.filter((t) => t.creditCardMetadata?.totalInstallments > 1).length,
    });
  }
}

console.table(resumo);
