import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { abrirBanco } from '../../src/db/abrir.js';

const TABELAS = ['pessoas', 'contas', 'movimentacoes', 'atribuicoes', 'categorias',
  'memoria_estabelecimento', 'orcamentos', 'contas_a_pagar', 'faturas', 'perguntas', 'estado'];

function tabelas(db) {
  return db.prepare("select name from sqlite_master where type='table'").all().map((r) => r.name);
}

function baseMinima(db) {
  db.prepare("insert into contas (tipo, banco, apelido, id_externo) values ('cartao','bb','BB','c1')").run();
  db.prepare("insert into pessoas (nome, eh_eu) values ('eu', 1)").run();
}

function inserirMov(db, idExterno) {
  return db.prepare(`insert into movimentacoes
    (id_externo, conta_id, direcao, tipo, descricao, estabelecimento_norm, valor_centavos, data, status)
    values (?, 1, 'saida', 'compra_cartao', 'X', 'x', 100, '2026-11-01', 'pendente')`).run(idExterno);
}

test('cria todas as tabelas', () => {
  const db = abrirBanco();
  const t = tabelas(db);
  for (const nome of TABELAS) assert.ok(t.includes(nome), `falta ${nome}`);
});

test('abrir duas vezes o mesmo arquivo não falha nem duplica', () => {
  const caminho = join(mkdtempSync(join(tmpdir(), 'cad-')), 'x.db');
  abrirBanco(caminho).close();
  const db = abrirBanco(caminho);
  assert.equal(db.prepare("select count(*) n from categorias where nome='mercado'").get().n, 1);
  db.close();
});

test('id_externo é único', () => {
  const db = abrirBanco();
  baseMinima(db);
  inserirMov(db, 't1');
  assert.throws(() => inserirMov(db, 't1'), /UNIQUE/);
});

test('atribuicoes aceita bp de 1 a 10000', () => {
  const db = abrirBanco();
  baseMinima(db);
  inserirMov(db, 't1');
  const ins = db.prepare('insert into atribuicoes (movimentacao_id, pessoa_id, bp) values (1, 1, ?)');
  ins.run(1);
  db.exec('delete from atribuicoes');
  ins.run(10000);
  db.exec('delete from atribuicoes');
  assert.throws(() => ins.run(0), /CHECK/);
  assert.throws(() => ins.run(10001), /CHECK/);
});

test('foreign keys ativas', () => {
  const db = abrirBanco();
  assert.equal(db.prepare('pragma foreign_keys').get().foreign_keys, 1);
});
