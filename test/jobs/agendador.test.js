import { test } from 'node:test';
import assert from 'node:assert/strict';
import { criarAgendador, dataLocal } from '../../src/jobs/agendador.js';

function relogioFalso(iso) {
  let agora = new Date(iso);
  return { agora: () => agora, avancar: (min) => { agora = new Date(agora.getTime() + min * 60_000); } };
}

test('dataLocal usa America/Sao_Paulo', () => {
  assert.deepEqual(dataLocal(new Date('2026-11-05T02:30:00Z')), { data: '2026-11-04', hora: 23, minuto: 30 });
});

test('sync roda na partida e a cada 2 horas', async () => {
  const relogio = relogioFalso('2026-11-04T10:00:00Z');
  const chamadas = [];
  const a = criarAgendador({ relogio, tarefas: { sync: async () => chamadas.push('sync'), diario: async () => {} } });
  await a.verificar();
  relogio.avancar(119);
  await a.verificar();
  assert.equal(chamadas.length, 1);
  relogio.avancar(1);
  await a.verificar();
  assert.equal(chamadas.length, 2);
});

test('diário às 09:00 de São Paulo, uma vez por dia', async () => {
  const relogio = relogioFalso('2026-11-04T11:58:00Z'); // 08:58 local
  const chamadas = [];
  const a = criarAgendador({ relogio, tarefas: { sync: async () => {}, diario: async (d) => chamadas.push(d) } });
  await a.verificar();
  assert.deepEqual(chamadas, []);
  relogio.avancar(2); // 09:00
  await a.verificar();
  relogio.avancar(60);
  await a.verificar();
  assert.deepEqual(chamadas, ['2026-11-04']);
  relogio.avancar(24 * 60);
  await a.verificar();
  assert.deepEqual(chamadas, ['2026-11-04', '2026-11-05']);
});

test('falha de uma tarefa não derruba o agendador e não repete o diário', async () => {
  const relogio = relogioFalso('2026-11-04T12:00:00Z');
  let n = 0;
  const erros = [];
  const a = criarAgendador({ relogio, tarefas: { sync: async () => { throw new Error('x'); }, diario: async () => { n++; } }, aoFalhar: (t, e) => erros.push(t) });
  await a.verificar();
  await a.verificar();
  assert.equal(n, 1);
  assert.ok(erros.includes('sync'));
});
