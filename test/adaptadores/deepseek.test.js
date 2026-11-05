import { test } from 'node:test';
import assert from 'node:assert/strict';
import { criarInterpretadorDeepSeek } from '../../src/adaptadores/deepseek/interpretador.js';

const pessoas = [{ id: 1, nome: 'eu', apelidos: [], ehEu: true }, { id: 2, nome: 'mãe', apelidos: ['mamãe'], ehEu: false }];
const categorias = ['mercado', 'lazer'];

function fetchFalso(conteudo, status = 200) {
  const chamadas = [];
  const f = async (url, init) => {
    chamadas.push({ url, init, corpo: JSON.parse(init.body) });
    const body = { choices: [{ message: { content: typeof conteudo === 'string' ? conteudo : JSON.stringify(conteudo) } }] };
    return new Response(JSON.stringify(body), { status });
  };
  f.chamadas = chamadas;
  return f;
}

test('requisição leva só texto, estabelecimento, nomes e categorias — sem valores nem cartão', async () => {
  const fetch = fetchFalso({ tipo: 'atribuicao', partes: [{ pessoa: 'mãe', percentual: 100 }] });
  const i = criarInterpretadorDeepSeek({ apiKey: 'k', modelo: 'deepseek-chat', fetch });
  await i.interpretar('foi da minha mãe', { estabelecimento: 'Netflix', pessoas, categorias, valorCentavos: 5590, cartao: 'BB Ourocard' });
  const { url, init, corpo } = fetch.chamadas[0];
  assert.equal(url, 'https://api.deepseek.com/chat/completions');
  assert.equal(init.headers.Authorization, 'Bearer k');
  assert.deepEqual(corpo.response_format, { type: 'json_object' });
  const tudo = JSON.stringify(corpo);
  assert.ok(tudo.includes('foi da minha mãe'));
  assert.ok(tudo.includes('Netflix'));
  assert.ok(!tudo.includes('5590') && !tudo.includes('55,90'), 'vazou valor');
  assert.ok(!tudo.includes('Ourocard'), 'vazou cartão');
});

test('resposta válida vira atribuição com precisaConfirmar', async () => {
  const i = criarInterpretadorDeepSeek({ apiKey: 'k', modelo: 'm', fetch: fetchFalso({ tipo: 'atribuicao', partes: [{ pessoa: 'mãe', percentual: 100 }], categoria: 'lazer' }) });
  assert.deepEqual(await i.interpretar('foi da minha mãe, cinema', { estabelecimento: 'Cinemark', pessoas, categorias }),
    { tipo: 'atribuicao', partes: [{ pessoaId: 2, bp: 10000 }], categoria: 'lazer', precisaConfirmar: true });
});

test('percentuais que não fecham, pessoa ou categoria inexistente viram inválido', async () => {
  for (const c of [
    { tipo: 'atribuicao', partes: [{ pessoa: 'mãe', percentual: 70 }] },
    { tipo: 'atribuicao', partes: [{ pessoa: 'tio', percentual: 100 }] },
    { tipo: 'categoria', categoria: 'viagem' },
    { tipo: 'outra coisa' },
  ]) {
    const i = criarInterpretadorDeepSeek({ apiKey: 'k', modelo: 'm', fetch: fetchFalso(c) });
    assert.deepEqual(await i.interpretar('x', { pessoas, categorias }), { tipo: 'invalido', motivo: 'desconhecido' }, JSON.stringify(c));
  }
});

test('JSON inválido ou HTTP de erro viram inválido', async () => {
  for (const f of [fetchFalso('nada de json'), fetchFalso({}, 500), async () => { throw new Error('rede'); }]) {
    const i = criarInterpretadorDeepSeek({ apiKey: 'k', modelo: 'm', fetch: f });
    assert.deepEqual(await i.interpretar('x', { pessoas, categorias }), { tipo: 'invalido', motivo: 'desconhecido' });
  }
});

test('categoria e entrada também são aceitas', async () => {
  let i = criarInterpretadorDeepSeek({ apiKey: 'k', modelo: 'm', fetch: fetchFalso({ tipo: 'categoria', categoria: 'Mercado' }) });
  assert.deepEqual(await i.interpretar('x', { pessoas, categorias }), { tipo: 'categoria', categoria: 'mercado', precisaConfirmar: true });
  i = criarInterpretadorDeepSeek({ apiKey: 'k', modelo: 'm', fetch: fetchFalso({ tipo: 'entrada', classe: 'renda' }) });
  assert.deepEqual(await i.interpretar('x', { pessoas, categorias }), { tipo: 'entrada', classe: 'renda', precisaConfirmar: true });
});

test('sugerirCategoria devolve uma categoria da lista ou null', async () => {
  let i = criarInterpretadorDeepSeek({ apiKey: 'k', modelo: 'm', fetch: fetchFalso({ categoria: 'lazer' }) });
  assert.equal(await i.sugerirCategoria('Cinemark', categorias), 'lazer');
  i = criarInterpretadorDeepSeek({ apiKey: 'k', modelo: 'm', fetch: fetchFalso({ categoria: 'viagem' }) });
  assert.equal(await i.sugerirCategoria('Cinemark', categorias), null);
});
