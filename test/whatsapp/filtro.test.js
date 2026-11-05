import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ehDoDono } from '../../src/whatsapp/filtro.js';

const dono = { jid: '5579999990000@s.whatsapp.net', lid: '123456789@lid' };

test('JID do dono é aceito', () => assert.equal(ehDoDono('5579999990000@s.whatsapp.net', dono), true));
test('LID do dono é aceito', () => assert.equal(ehDoDono('123456789@lid', dono), true));
test('JID com sufixo de dispositivo é aceito', () => assert.equal(ehDoDono('5579999990000:12@s.whatsapp.net', dono), true));
test('LID com sufixo de dispositivo é aceito', () => assert.equal(ehDoDono('123456789:3@lid', dono), true));
test('outro número é rejeitado', () => assert.equal(ehDoDono('5579888880000@s.whatsapp.net', dono), false));
test('grupo é rejeitado', () => assert.equal(ehDoDono('5579999990000-1612345678@g.us', dono), false));
test('status é rejeitado', () => assert.equal(ehDoDono('status@broadcast', dono), false));
test('vazio e dono sem dados são rejeitados', () => {
  assert.equal(ehDoDono('', dono), false);
  assert.equal(ehDoDono(undefined, dono), false);
  assert.equal(ehDoDono('5579999990000@s.whatsapp.net', {}), false);
});
test('número parecido não passa por prefixo', () => assert.equal(ehDoDono('55799999900001@s.whatsapp.net', dono), false));
