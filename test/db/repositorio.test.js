import { test } from 'node:test';
import assert from 'node:assert/strict';
import { abrirBanco } from '../../src/db/abrir.js';
import { criarRepositorio } from '../../src/db/repositorio.js';

function montar() {
  const repo = criarRepositorio(abrirBanco());
  const contaId = repo.upsertConta({ idExterno: 'c1', tipo: 'cartao', banco: 'bb', apelido: 'BB', diaFechamento: 15, diaVencimento: 25 });
  const eu = repo.criarPessoa({ nome: 'eu', ehEu: true });
  const mae = repo.criarPessoa({ nome: 'mãe', apelidos: ['mamãe'] });
  return { repo, contaId, eu, mae };
}
const mov = (id, extra = {}) => ({ idExterno: id, contaExternaId: 'c1', direcao: 'saida', tipo: 'compra_cartao',
  descricao: 'Padaria Boa', valorCentavos: 1000, data: '2026-11-01', ...extra });

test('inserir o mesmo id_externo duas vezes devolve null na segunda', () => {
  const { repo, contaId } = montar();
  assert.equal(typeof repo.inserirMovimentacao(mov('t1'), { contaId, status: 'pendente' }), 'number');
  assert.equal(repo.inserirMovimentacao(mov('t1'), { contaId, status: 'pendente' }), null);
});

test('movimentação volta em camelCase com estabelecimento normalizado', () => {
  const { repo, contaId } = montar();
  const id = repo.inserirMovimentacao(mov('t1'), { contaId, status: 'pendente', faturaRef: '2026-11' });
  const m = repo.obterMovimentacao(id);
  assert.equal(m.estabelecimentoNorm, 'padaria boa');
  assert.equal(m.valorCentavos, 1000);
  assert.equal(m.faturaRef, '2026-11');
  assert.equal(m.contaApelido, 'BB');
});

test('pendentes da mais antiga para a mais nova', () => {
  const { repo, contaId } = montar();
  repo.inserirMovimentacao(mov('b', { data: '2026-11-05' }), { contaId, status: 'pendente' });
  repo.inserirMovimentacao(mov('a', { data: '2026-11-01' }), { contaId, status: 'pendente' });
  repo.inserirMovimentacao(mov('c', { data: '2026-11-02' }), { contaId, status: 'ignorada' });
  assert.deepEqual(repo.listarPendentes().map((m) => m.idExterno), ['a', 'b']);
});

test('perguntas abertas da mais recente para a mais antiga', () => {
  const { repo, contaId } = montar();
  const a = repo.inserirMovimentacao(mov('a'), { contaId, status: 'pendente' });
  const b = repo.inserirMovimentacao(mov('b'), { contaId, status: 'pendente' });
  repo.registrarPergunta(a, 'msg-a');
  repo.registrarPergunta(b, 'msg-b');
  assert.deepEqual(repo.perguntasAbertas().map((p) => p.movId), [b, a]);
  assert.equal(repo.perguntaPorMensagem('msg-a'), a);
  repo.fecharPergunta(b);
  assert.deepEqual(repo.perguntasAbertas().map((p) => p.movId), [a]);
});

test('ultimoDono devolve as partes da última classificação do estabelecimento', () => {
  const { repo, contaId, eu, mae } = montar();
  const a = repo.inserirMovimentacao(mov('a', { data: '2026-10-01' }), { contaId, status: 'pendente' });
  repo.gravarAtribuicoes(a, [{ pessoaId: eu, bp: 10000 }]);
  repo.marcarClassificada(a);
  const b = repo.inserirMovimentacao(mov('b', { data: '2026-10-20' }), { contaId, status: 'pendente' });
  repo.gravarAtribuicoes(b, [{ pessoaId: mae, bp: 6000 }, { pessoaId: eu, bp: 4000 }]);
  repo.marcarClassificada(b);
  assert.deepEqual(repo.ultimoDono('padaria boa').sort((x, y) => x.pessoaId - y.pessoaId),
    [{ pessoaId: eu, bp: 4000 }, { pessoaId: mae, bp: 6000 }]);
  assert.equal(repo.ultimoDono('desconhecido'), null);
});

test('gravarAtribuicoes substitui e exige soma 10000', () => {
  const { repo, contaId, eu, mae } = montar();
  const a = repo.inserirMovimentacao(mov('a'), { contaId, status: 'pendente' });
  repo.gravarAtribuicoes(a, [{ pessoaId: eu, bp: 10000 }]);
  repo.gravarAtribuicoes(a, [{ pessoaId: mae, bp: 10000 }]);
  assert.deepEqual(repo.atribuicoesDe(a), [{ pessoaId: mae, bp: 10000 }]);
  assert.throws(() => repo.gravarAtribuicoes(a, [{ pessoaId: mae, bp: 6000 }]), /10000/);
  assert.deepEqual(repo.atribuicoesDe(a), [{ pessoaId: mae, bp: 10000 }]);
});

test('memória de categoria e estado', () => {
  const { repo } = montar();
  assert.equal(repo.memoriaCategoria('padaria boa'), null);
  repo.salvarMemoria('padaria boa', 'mercado');
  repo.salvarMemoria('padaria boa', 'alimentação fora');
  assert.equal(repo.memoriaCategoria('padaria boa'), 'alimentação fora');
  assert.equal(repo.obterEstado('ultimoSync'), null);
  repo.definirEstado('ultimoSync', '2026-11-04');
  assert.equal(repo.obterEstado('ultimoSync'), '2026-11-04');
});

test('grupos de parcelas trazem a última parcela vista', () => {
  const { repo, contaId } = montar();
  const p1 = repo.inserirMovimentacao(mov('p1', { descricao: 'Loja X 01/06', parcelaAtual: 1, totalParcelas: 6, valorTotalCentavos: 6000 }), { contaId, status: 'pendente' });
  const g = repo.abrirGrupo({ contaId, estabelecimentoNorm: 'loja x', valorTotalCentavos: 6000, totalParcelas: 6 });
  repo.vincularGrupo(p1, g);
  assert.deepEqual(repo.gruposParcelas(), [{ id: g, contaId, estabelecimentoNorm: 'loja x', valorTotalCentavos: 6000, totalParcelas: 6, ultimaParcela: 1 }]);
});

test('pessoas com apelidos e categorias', () => {
  const { repo } = montar();
  const mae = repo.listarPessoas().find((p) => p.nome === 'mãe');
  assert.deepEqual(mae.apelidos, ['mamãe']);
  assert.equal(repo.pessoaEu().nome, 'eu');
  assert.ok(repo.listarCategorias().includes('mercado'));
});
