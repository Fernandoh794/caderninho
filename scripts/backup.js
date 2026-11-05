import { DatabaseSync } from 'node:sqlite';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/** Cópia consistente do SQLite (inclui o WAL) com VACUUM INTO. */
export function fazerBackup(origem, destino) {
  if (existsSync(destino)) throw new Error(`destino já existe: ${destino}`);
  const db = new DatabaseSync(origem);
  try {
    db.prepare('vacuum into ?').run(destino);
  } finally {
    db.close();
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [origem, destino] = process.argv.slice(2);
  if (!origem || !destino) {
    console.error('uso: node scripts/backup.js <banco> <destino>');
    process.exit(2);
  }
  fazerBackup(origem, destino);
}
