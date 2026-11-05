import { test } from 'node:test';
import assert from 'node:assert/strict';

test('node:sqlite disponível e funcional', async () => {
  const { DatabaseSync } = await import('node:sqlite');
  const db = new DatabaseSync(':memory:');
  assert.deepEqual({ ...db.prepare('select 1 as um').get() }, { um: 1 });
});
