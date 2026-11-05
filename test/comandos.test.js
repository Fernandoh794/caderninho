import { test } from 'node:test';
import assert from 'node:assert/strict';
import { abrirBanco } from '../src/db/abrir.js';
import { criarRepositorio } from '../src/db/repositorio.js';
import { executarComando, lerValor } from '../src/comandos.js';
import { listarOrcamentos } from '../src/nucleo/orcamento.js';

function montar() {
  const repo = criarRepositorio(abrirBanco());
  const euId = repo.criarPessoa({ nome: 'eu', ehEu: true });
  const mae = repo.criarPessoa({ nome: 'mãe' });
  const cartao = repo.upsertConta({ idExterno: 'cc', tipo: 'cartao', banco: 'bb', apelido: 'BB', diaFechamento: 15, diaVencimento: 25 });
  const conta = repo.upsertConta({ idExterno: 'cr', tipo: 'corrente', banco: 'inter', apelido: 'Inter' });
  const ctx = { repo, hoje: '2026-11-04', euId };
  const run = (nome, ...args) => executarComando(nome, args, ctx);
  return { repo, euId, mae, cartao, conta, run };
}

test('lerValor', () => {
  assert.equal(lerValor('500'), 50000);
  assert.equal(lerValor('350,50'), 35050);
  assert.equal(lerValor('1.200,00'), 120000);
  assert.equal(lerValor('12.5'), 1250);
  assert.equal(lerValor('abc'), null);
});

test('orcamento grava e confirma; categoria desconhecida é recusada', () => {
  const { repo, run } = montar();
  assert.match(run('orcamento', 'Lazer', '500'), /lazer.*R\$ 500,00/);
  assert.deepEqual(listarOrcamentos(repo), [{ categoria: 'lazer', limiteCentavos: 50000 }]);
  assert.match(run('orcamento', 'viagem', '500'), /não conheço a categoria "viagem"/i);
});

test('!gastos lista o mês por categoria com o saldo do orçamento', () => {
  const { repo, conta, run } = montar();
  run('orcamento', 'mercado', '500');
  repo.inserirMovimentacao({ idExterno: 'a', direcao: 'saida', tipo: 'pix', descricao: 'X', valorCentavos: 14200, data: '2026-11-02' }, { contaId: conta, status: 'classificada', categoria: 'mercado' });
  assert.match(run('gastos'), /mercado: R\$ 142,00 de R\$ 500,00 \(faltam R\$ 358,00\)/);
});

test('conta, !contas e paguei', () => {
  const { run } = montar();
  assert.match(run('conta', 'internet', '120', '10'), /internet.*R\$ 120,00.*dia 10/);
  assert.match(run('contas'), /10\/11 internet: R\$ 120,00/);
  assert.match(run('paguei', 'Internet'), /internet.*paga/i);
  assert.match(run('contas'), /10\/12 internet/);
  assert.match(run('paguei', 'academia'), /não achei/i);
});

test('!pendentes e !fatura', () => {
  const { repo, cartao, mae, run } = montar();
  assert.match(run('pendentes'), /[Nn]ada pendente/);
  repo.inserirMovimentacao({ idExterno: 'p', direcao: 'saida', tipo: 'compra_cartao', descricao: 'Netflix', valorCentavos: 5590, data: '2026-11-01' }, { contaId: cartao, status: 'pendente', faturaRef: '2026-11' });
  const c = repo.inserirMovimentacao({ idExterno: 'c', direcao: 'saida', tipo: 'compra_cartao', descricao: 'Loja', valorCentavos: 10000, data: '2026-11-01' }, { contaId: cartao, status: 'classificada', faturaRef: '2026-11', categoria: 'compras' });
  repo.gravarAtribuicoes(c, [{ pessoaId: mae, bp: 10000 }]);
  assert.match(run('pendentes'), /1 pendente.*Netflix, R\$ 55,90/s);
  const f = run('fatura');
  assert.match(f, /BB.*2026-11/);
  assert.match(f, /mãe: R\$ 100,00/);
  assert.match(f, /1 sem dono/);
});

test('cartao define fechamento e vencimento', () => {
  const { repo, run } = montar();
  assert.match(run('cartao', 'inter', '5', '12'), /Inter.*fecha dia 5.*vence dia 12/);
  assert.equal(repo.listarContas().find((c) => c.apelido === 'Inter').diaFechamento, 5);
});

test('comando desconhecido responde com a lista', () => {
  const { run } = montar();
  assert.match(run('xyz'), /!pendentes.*!fatura.*!gastos.*!contas/s);
});

test('!cartao recalcula a fatura das compras já gravadas', () => {
  const { repo, run } = montar();
  const semDia = repo.upsertConta({ idExterno: 'mp', tipo: 'cartao', banco: 'mp', apelido: 'MP' });
  const id = repo.inserirMovimentacao({ idExterno: 'x', direcao: 'saida', tipo: 'compra_cartao', descricao: 'Loja', valorCentavos: 100, data: '2026-10-20' }, { contaId: semDia, status: 'pendente', faturaRef: null });
  run('cartao', 'MP', '15', '25');
  assert.equal(repo.obterMovimentacao(id).faturaRef, '2026-11');
});
