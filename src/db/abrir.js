import { DatabaseSync } from 'node:sqlite';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const PASTA_MIGRACOES = join(dirname(fileURLToPath(import.meta.url)), 'migracoes');

/**
 * Abre (ou cria) o banco e aplica as migrações pendentes, em ordem,
 * usando PRAGMA user_version como versão do esquema.
 * @param {string} [caminho]
 * @returns {DatabaseSync}
 */
export function abrirBanco(caminho = ':memory:') {
  const db = new DatabaseSync(caminho);
  db.exec('pragma foreign_keys = on');
  if (caminho !== ':memory:') db.exec('pragma journal_mode = wal');

  const atual = db.prepare('pragma user_version').get().user_version;
  const migracoes = readdirSync(PASTA_MIGRACOES)
    .filter((f) => /^\d{3}_.+\.sql$/.test(f))
    .sort()
    .map((f) => ({ versao: Number(f.slice(0, 3)), arquivo: f }))
    .filter((m) => m.versao > atual);

  for (const { versao, arquivo } of migracoes) {
    const sql = readFileSync(join(PASTA_MIGRACOES, arquivo), 'utf8');
    db.exec('begin');
    try {
      db.exec(sql);
      db.exec(`pragma user_version = ${versao}`);
      db.exec('commit');
    } catch (erro) {
      db.exec('rollback');
      throw new Error(`falha na migração ${arquivo}: ${erro.message}`, { cause: erro });
    }
  }
  return db;
}
