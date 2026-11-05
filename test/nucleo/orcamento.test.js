import { test } from 'node:test';
import assert from 'node:assert/strict';
import { abrirBanco } from '../../src/db/abrir.js';
import { criarRepositorio } from '../../src/db/repositorio.js';
import { definirOrcamento, avisosDeOrcamento, listarOrcamentos, textoAvisoOrcamento } from '../../src/nucleo/orcamento.js';

function montar() {
  const repo = criarRepositorio(abrirBanco());
  const eu = repo.criarPessoa({ nome: 'eu', ehEu: true });
  const conta = repo.upsertConta({ idExterno: 'cr', tipo: 'corrente', banco: 'inter', apelido: 'Inter' });
  let seq = 0;
  const pix = (valor, data = '2026-11-03', categoria = 'lazer') =>
    repo.inserirMovimentacao({ idExterno: `t${++seq}`, direcao: 'saida', tipo: 'pix', descricao: 'X', valorCentavos: valor, data }, { contaId: conta, status: 'classificada', categoria });
  return { repo, eu, pix };
}

test('"orçamento lazer 500" define R$ 500,00', () => {
  const { repo } = montar();
  definirOrcamento(repo, 'lazer', 50000);
  definirOrcamento(repo, 'lazer', 60000);
  assert.deepEqual(listarOrcamentos(repo), [{ categoria: 'lazer', limiteCentavos: 60000 }]);
});

test('79% não avisa; 80% avisa uma vez; 100% avisa uma vez', () => {
  const { repo, eu, pix } = montar();
  definirOrcamento(repo, 'lazer', 10000);
  pix(7900);
  assert.deepEqual(avisosDeOrcamento(repo, '2026-11', eu), []);
  pix(100);
  assert.deepEqual(avisosDeOrcamento(repo, '2026-11', eu), [{ categoria: 'lazer', nivel: 80, gasto: 8000, limite: 10000 }]);
  assert.deepEqual(avisosDeOrcamento(repo, '2026-11', eu), []);
  pix(2001);
  assert.deepEqual(avisosDeOrcamento(repo, '2026-11', eu), [{ categoria: 'lazer', nivel: 100, gasto: 10001, limite: 10000 }]);
  assert.deepEqual(avisosDeOrcamento(repo, '2026-11', eu), []);
});

test('saltar direto para acima de 100% dá só o aviso de 100', () => {
  const { repo, eu, pix } = montar();
  definirOrcamento(repo, 'lazer', 10000);
  pix(15000);
  assert.deepEqual(avisosDeOrcamento(repo, '2026-11', eu).map((a) => a.nivel), [100]);
  assert.deepEqual(avisosDeOrcamento(repo, '2026-11', eu), []);
});

test('no mês seguinte os avisos voltam a valer', () => {
  const { repo, eu, pix } = montar();
  definirOrcamento(repo, 'lazer', 10000);
  pix(8500, '2026-11-03');
  avisosDeOrcamento(repo, '2026-11', eu);
  pix(8500, '2026-12-03');
  assert.deepEqual(avisosDeOrcamento(repo, '2026-12', eu).map((a) => a.nivel), [80]);
});

test('categoria sem orçamento nunca avisa', () => {
  const { repo, eu, pix } = montar();
  pix(999999, '2026-11-03', 'mercado');
  assert.deepEqual(avisosDeOrcamento(repo, '2026-11', eu), []);
});

test('textoAvisoOrcamento', () => {
  assert.match(textoAvisoOrcamento({ categoria: 'lazer', nivel: 80, gasto: 8000, limite: 10000 }), /80%.*lazer.*R\$ 80,00 de R\$ 100,00/);
  assert.match(textoAvisoOrcamento({ categoria: 'lazer', nivel: 100, gasto: 12000, limite: 10000 }), /estourou.*lazer/i);
});
