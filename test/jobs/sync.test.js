import { test } from 'node:test';
import assert from 'node:assert/strict';
import { abrirBanco } from '../../src/db/abrir.js';
import { criarRepositorio } from '../../src/db/repositorio.js';
import { criarFonteFalsa } from '../../src/falsos/fonte.js';
import { ErroLimite } from '../../src/portas/fonte.js';
import { sincronizar } from '../../src/jobs/sync.js';

const HOJE = '2026-11-04';
const cartao = { idExterno: 'cc', tipo: 'cartao', banco: 'bb', apelido: 'BB', diaFechamento: 15, diaVencimento: 25 };
const corrente = { idExterno: 'cr', tipo: 'corrente', banco: 'inter', apelido: 'Inter' };
const compra = (id, data, extra = {}) => ({ idExterno: id, contaExternaId: 'cc', direcao: 'saida', tipo: 'compra_cartao', descricao: 'Loja', valorCentavos: 1000, data, ...extra });
const pix = (id, data, extra = {}) => ({ idExterno: id, contaExternaId: 'cr', direcao: 'saida', tipo: 'pix', descricao: 'Padaria', valorCentavos: 500, data, ...extra });

function montar(movimentacoes) {
  const repo = criarRepositorio(abrirBanco());
  repo.criarPessoa({ nome: 'eu', ehEu: true });
  const fonte = criarFonteFalsa({ contas: [cartao, corrente], movimentacoes });
  return { repo, fonte, rodar: () => sincronizar({ fonte, repo, hoje: HOJE, nomesProprios: ['Fernando Souza'] }) };
}
const porId = (repo, idExterno) => repo.listarMovimentacoes().find((m) => m.idExterno === idExterno);

test('primeira carga: fora da fatura aberta e do mês corrente vira ignorada', async () => {
  // fatura aberta do cartão em 04/11 com fechamento 15: ref 2026-11 (compras de 16/10 a 15/11)
  const { repo, rodar } = montar([
    compra('velha', '2026-10-10'), compra('aberta', '2026-10-20'),
    pix('pix-out', '2026-10-30'), pix('pix-nov', '2026-11-02'),
  ]);
  const r = await rodar();
  assert.equal(r.novas, 4);
  assert.equal(porId(repo, 'velha').status, 'ignorada');
  assert.equal(porId(repo, 'aberta').status, 'pendente');
  assert.equal(porId(repo, 'aberta').faturaRef, '2026-11');
  assert.equal(porId(repo, 'pix-out').status, 'ignorada');
  assert.equal(porId(repo, 'pix-nov').status, 'pendente');
  assert.equal(r.pendentes, 2);
  assert.equal(repo.obterEstado('ultimoSync'), HOJE);
});

test('segundo sync com as mesmas movimentações não duplica nem cria pendente', async () => {
  const { repo, rodar } = montar([compra('a', '2026-11-01'), pix('b', '2026-11-02')]);
  await rodar();
  const total = repo.listarMovimentacoes().length;
  const r = await rodar();
  assert.deepEqual(r, { novas: 0, pendentes: 0 });
  assert.equal(repo.listarMovimentacoes().length, total);
});

test('herdar copia atribuições e categoria da primeira parcela', async () => {
  const { repo, fonte, rodar } = montar([compra('p1', '2026-11-01', { descricao: 'Loja X 01/06', parcelaAtual: 1, totalParcelas: 6, valorTotalCentavos: 6000 })]);
  await rodar();
  const p1 = porId(repo, 'p1');
  const mae = repo.criarPessoa({ nome: 'mãe' });
  repo.gravarAtribuicoes(p1.id, [{ pessoaId: mae, bp: 10000 }]);
  repo.definirCategoria(p1.id, 'compras');
  const g = repo.abrirGrupo({ contaId: p1.contaId, estabelecimentoNorm: p1.estabelecimentoNorm, valorTotalCentavos: 6000, totalParcelas: 6 });
  repo.vincularGrupo(p1.id, g);
  repo.marcarClassificada(p1.id);

  fonte.movimentacoes.push(compra('p2', '2026-12-01', { descricao: 'Loja X 02/06', parcelaAtual: 2, totalParcelas: 6, valorTotalCentavos: 6000 }));
  fonte.movimentacoes.push(compra('p3', '2027-01-01', { descricao: 'Loja X 03/06', parcelaAtual: 3, totalParcelas: 6, valorTotalCentavos: 6000 }));
  await rodar();
  for (const id of ['p2', 'p3']) {
    const p = porId(repo, id);
    assert.equal(p.status, 'classificada', id);
    assert.equal(p.categoria, 'compras');
    assert.equal(p.grupoParcelasId, g);
    assert.deepEqual(repo.atribuicoesDe(p.id), [{ pessoaId: mae, bp: 10000 }]);
  }
});

test('categorizar grava categoria e transferência fecha sem pergunta', async () => {
  const { repo, rodar, fonte } = montar([]);
  repo.salvarMemoria('padaria', 'alimentação fora');
  fonte.movimentacoes.push(pix('p', '2026-11-02'));
  fonte.movimentacoes.push(pix('t', '2026-11-03', { descricao: 'Pix enviado Fernando Souza' }));
  fonte.movimentacoes.push({ ...pix('f', '2026-11-03'), tipo: 'pagamento_fatura', descricao: 'Pagamento fatura' });
  const r = await rodar();
  assert.equal(r.pendentes, 0);
  assert.equal(porId(repo, 'p').categoria, 'alimentação fora');
  assert.equal(porId(repo, 'p').status, 'classificada');
  assert.equal(porId(repo, 't').status, 'classificada');
  assert.equal(porId(repo, 't').tipo, 'transferencia');
  assert.equal(porId(repo, 'f').tipo, 'pagamento_fatura');
});

test('ErroLimite da fonte propaga e não marca ultimoSync', async () => {
  const { repo, fonte, rodar } = montar([]);
  fonte.erro = new ErroLimite();
  await assert.rejects(rodar, ErroLimite);
  assert.equal(repo.obterEstado('ultimoSync'), null);
});
