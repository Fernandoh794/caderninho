import { test } from 'node:test';
import assert from 'node:assert/strict';
import { faturaRefDe } from '../../src/nucleo/fatura.js';

test('faturaRefDe', () => {
  assert.equal(faturaRefDe('2026-10-20', 15), '2026-11');
  assert.equal(faturaRefDe('2026-10-10', 15), '2026-10');
  assert.equal(faturaRefDe('2026-10-15', 15), '2026-10');
  assert.equal(faturaRefDe('2026-12-20', 15), '2027-01');
});
test('fechamento dia 31 em mês curto fecha no último dia', () => {
  assert.equal(faturaRefDe('2026-02-28', 31), '2026-02');
  assert.equal(faturaRefDe('2026-03-01', 31), '2026-03');
});
