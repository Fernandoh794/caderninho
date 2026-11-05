import { test } from 'node:test';
import assert from 'node:assert/strict';
import { criarTranscritorGroq } from '../../src/adaptadores/groq/transcritor.js';
import { ErroTranscricao } from '../../src/portas/transcritor.js';

function fetchFalso(resposta, status = 200) {
  const chamadas = [];
  const f = async (url, init) => {
    chamadas.push({ url, init });
    return new Response(JSON.stringify(resposta), { status, headers: { 'content-type': 'application/json' } });
  };
  f.chamadas = chamadas;
  return f;
}

test('envia modelo, idioma e arquivo e devolve o texto', async () => {
  const fetch = fetchFalso({ text: ' mãe mercado ' });
  const t = criarTranscritorGroq({ apiKey: 'k', fetch });
  assert.equal(await t.transcrever(Buffer.from('abc'), 'audio/ogg; codecs=opus'), 'mãe mercado');
  const { url, init } = fetch.chamadas[0];
  assert.equal(url, 'https://api.groq.com/openai/v1/audio/transcriptions');
  assert.equal(init.headers.Authorization, 'Bearer k');
  assert.equal(init.body.get('model'), 'whisper-large-v3-turbo');
  assert.equal(init.body.get('language'), 'pt');
  const arquivo = init.body.get('file');
  assert.equal(arquivo.size, 3);
  assert.match(arquivo.name, /\.ogg$/);
});

test('texto vazio lança ErroTranscricao', async () => {
  const t = criarTranscritorGroq({ apiKey: 'k', fetch: fetchFalso({ text: '  ' }) });
  await assert.rejects(() => t.transcrever(Buffer.from('a'), 'audio/ogg'), ErroTranscricao);
});

test('HTTP diferente de 200 lança ErroTranscricao', async () => {
  const t = criarTranscritorGroq({ apiKey: 'k', fetch: fetchFalso({ error: 'x' }, 500) });
  await assert.rejects(() => t.transcrever(Buffer.from('a'), 'audio/ogg'), ErroTranscricao);
});

test('falha de rede vira ErroTranscricao', async () => {
  const t = criarTranscritorGroq({ apiKey: 'k', fetch: async () => { throw new TypeError('fetch failed'); } });
  await assert.rejects(() => t.transcrever(Buffer.from('a'), 'audio/ogg'), ErroTranscricao);
});
