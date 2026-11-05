import { test } from 'node:test';
import assert from 'node:assert/strict';
import { comEspera, criarMonitorSync, avisoConsentimento, textoPendencias } from '../../src/jobs/saude.js';
import { ErroLimite } from '../../src/portas/fonte.js';

test('comEspera tenta N vezes dobrando a espera', async () => {
  const esperas = [];
  let n = 0;
  await assert.rejects(() => comEspera(async () => { n++; throw new Error('x'); }, { tentativas: 4, baseMs: 100, esperar: async (ms) => esperas.push(ms) }), /x/);
  assert.equal(n, 4);
  assert.deepEqual(esperas, [100, 200, 400]);
});

test('comEspera devolve o primeiro sucesso', async () => {
  let n = 0;
  const r = await comEspera(async () => { if (++n < 3) throw new Error('x'); return 'ok'; }, { tentativas: 5, baseMs: 1, esperar: async () => {} });
  assert.equal(r, 'ok');
  assert.equal(n, 3);
});

test('monitor: um único aviso na 3ª falha seguida; sucesso rearma', async () => {
  const avisos = [];
  const m = criarMonitorSync({ aviso: async (t) => avisos.push(t) });
  await m.falha(new Error('a'));
  await m.falha(new ErroLimite());
  assert.equal(avisos.length, 0);
  await m.falha(new Error('c'));
  assert.equal(avisos.length, 1);
  await m.falha(new Error('d'));
  await m.falha(new Error('e'));
  assert.equal(avisos.length, 1);
  m.sucesso();
  await m.falha(new Error('f'));
  await m.falha(new Error('g'));
  await m.falha(new Error('h'));
  assert.equal(avisos.length, 2);
});

test('avisoConsentimento a 31, 30 dias e vencido', () => {
  assert.equal(avisoConsentimento('2026-12-05', '2026-11-04'), null);
  assert.match(avisoConsentimento('2026-12-04', '2026-11-04'), /30 dias/);
  assert.match(avisoConsentimento('2026-11-01', '2026-11-04'), /venceu/);
  assert.equal(avisoConsentimento(null, '2026-11-04'), null);
});

test('textoPendencias', () => {
  assert.equal(textoPendencias(0), null);
  assert.match(textoPendencias(1), /1 movimentação/);
  assert.match(textoPendencias(4), /4 movimentações/);
});

test('falha de autorização avisa na hora e não fica re-tentando', async () => {
  const { ErroAutorizacao } = await import('../../src/portas/fonte.js');
  const avisos = [];
  const m = criarMonitorSync({ aviso: async (t) => avisos.push(t) });
  await m.falha(new ErroAutorizacao());
  assert.equal(avisos.length, 1);
  assert.match(avisos[0], /consentimento/);
  let n = 0;
  await assert.rejects(() => comEspera(async () => { n++; throw new ErroAutorizacao(); }, { tentativas: 3, baseMs: 1, esperar: async () => {} }));
  assert.equal(n, 1);
});
