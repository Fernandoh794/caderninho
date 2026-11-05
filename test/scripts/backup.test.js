import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { abrirBanco } from '../../src/db/abrir.js';
import { criarRepositorio } from '../../src/db/repositorio.js';
import { fazerBackup } from '../../scripts/backup.js';

test('backup gera cópia consistente com os dados', () => {
  const dir = mkdtempSync(join(tmpdir(), 'cad-bkp-'));
  const origem = join(dir, 'caderninho.db');
  const repo = criarRepositorio(abrirBanco(origem));
  repo.criarPessoa({ nome: 'eu', ehEu: true });
  repo.salvarMemoria('padaria', 'mercado');

  const destino = join(dir, 'copia.db');
  fazerBackup(origem, destino);
  assert.ok(existsSync(destino));
  const copia = new DatabaseSync(destino, { readOnly: true });
  assert.equal(copia.prepare('select categoria from memoria_estabelecimento').get().categoria, 'mercado');
  assert.equal(copia.prepare('pragma user_version').get().user_version, 1);
  copia.close();
  repo.db.close();
});

test('backup recusa sobrescrever destino existente', () => {
  const dir = mkdtempSync(join(tmpdir(), 'cad-bkp-'));
  const origem = join(dir, 'a.db');
  abrirBanco(origem).close();
  const destino = join(dir, 'b.db');
  fazerBackup(origem, destino);
  assert.throws(() => fazerBackup(origem, destino), /existe/);
});
