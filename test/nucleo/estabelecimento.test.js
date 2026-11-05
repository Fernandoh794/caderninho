import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizarEstabelecimento as n } from '../../src/nucleo/estabelecimento.js';

test('prefixo de canal, acento, caixa e sufixo societário', () => {
  assert.equal(n('PIX MERC SAO JOSE LTDA'), n('Merc São José'));
  assert.equal(n('Merc São José'), 'merc sao jose');
});

test('remove número de parcela', () => {
  assert.equal(n('NETFLIX.COM 02/06'), 'netflix.com');
  assert.equal(n('LOJA X PARC 03/10'), 'loja x');
});

test('prefixos de adquirente com asterisco', () => {
  assert.equal(n('MP*PADARIABOM'), 'padariabom');
  assert.equal(n('PAG*Farmacia Central'), 'farmacia central');
  assert.equal(n('COMPRA CARTAO Padaria'), 'padaria');
});

test('sufixos SA e ME e espaços', () => {
  assert.equal(n('  Posto   Shell  S.A. '), 'posto shell');
  assert.equal(n('Doces Maria ME'), 'doces maria');
});

test('vazio', () => {
  assert.equal(n(''), '');
  assert.equal(n(undefined), '');
});
