import { test } from 'node:test';
import assert from 'node:assert/strict';
import { carregarConfig } from '../src/config.js';

test('carregarConfig({}) nomeia as variáveis ausentes', () => {
  assert.throws(() => carregarConfig({}), (e) => /PLUGGY_CLIENT_ID/.test(e.message) && /DONO_JID/.test(e.message) && /GROQ_API_KEY/.test(e.message));
});

test('carregarConfig com o mínimo', () => {
  const c = carregarConfig({ PLUGGY_CLIENT_ID: 'a', PLUGGY_CLIENT_SECRET: 'b', PLUGGY_ITEM_IDS: 'x, y', GROQ_API_KEY: 'g', DEEPSEEK_API_KEY: 'd', DONO_JID: '55@s.whatsapp.net', NOMES_PROPRIOS: 'Fulano de Tal' });
  assert.deepEqual(c.pluggy.itemIds, ['x', 'y']);
  assert.equal(c.dbPath, './caderninho.db');
  assert.equal(c.deepseek.modelo, 'deepseek-chat');
  assert.deepEqual(c.nomesProprios, ['Fulano de Tal']);
});

test('CONSENTIMENTO_VENCE_EM precisa ser data ISO', () => {
  assert.throws(() => carregarConfig({ PLUGGY_CLIENT_ID: 'a', PLUGGY_CLIENT_SECRET: 'b', PLUGGY_ITEM_IDS: 'x', GROQ_API_KEY: 'g', DEEPSEEK_API_KEY: 'd', DONO_JID: 'j', CONSENTIMENTO_VENCE_EM: '05/11/2027' }), /CONSENTIMENTO_VENCE_EM/);
});
