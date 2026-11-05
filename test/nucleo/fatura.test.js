import { test } from 'node:test';
import assert from 'node:assert/strict';
import { abrirBanco } from '../../src/db/abrir.js';
import { criarRepositorio } from '../../src/db/repositorio.js';
import { totaisDaFatura, verificarFaturas, textoAviso } from '../../src/nucleo/fatura.js';

function montar() {
  const repo = criarRepositorio(abrirBanco());
  const eu = repo.criarPessoa({ nome: 'eu', ehEu: true });
  const mae = repo.criarPessoa({ nome: 'mãe' });
  const irma = repo.criarPessoa({ nome: 'irmã' });
  const cartao = repo.upsertConta({ idExterno: 'cc', tipo: 'cartao', banco: 'bb', apelido: 'BB', diaFechamento: 15, diaVencimento: 25 });
  let seq = 0;
  const mov = ({ valor = 1000, ref = '2026-10', partes, status = 'classificada', tipo = 'compra_cartao', data = '2026-10-10' } = {}) => {
    const id = repo.inserirMovimentacao({ idExterno: `t${++seq}`, direcao: tipo === 'estorno' ? 'entrada' : 'saida', tipo, descricao: 'X', valorCentavos: valor, data },
      { contaId: cartao, status, faturaRef: ref, categoria: 'compras' });
    if (partes) repo.gravarAtribuicoes(id, partes);
    return id;
  };
  return { repo, eu, mae, irma, cartao, mov };
}
const soma = (t) => t.reduce((s, p) => s + p.centavos, 0);
const de = (t, id) => t.find((p) => p.pessoaId === id)?.centavos ?? 0;

test('soma dos totais por pessoa = soma da fatura, com sobra para o dono', () => {
  const { repo, eu, mae, irma, cartao, mov } = montar();
  mov({ valor: 1000, partes: [{ pessoaId: eu, bp: 3334 }, { pessoaId: mae, bp: 3333 }, { pessoaId: irma, bp: 3333 }] });
  mov({ valor: 1, partes: [{ pessoaId: mae, bp: 5000 }, { pessoaId: irma, bp: 5000 }] });
  mov({ valor: 2590, partes: [{ pessoaId: mae, bp: 10000 }] });
  const t = totaisDaFatura(repo, cartao, '2026-10', eu);
  assert.equal(soma(t), 3591);
  assert.equal(de(t, mae), 333 + 2590);
  assert.equal(de(t, eu), 334 + 1);
});

test('estorno reduz o total da pessoa; ignorada e outra fatura ficam de fora', () => {
  const { repo, eu, mae, cartao, mov } = montar();
  mov({ valor: 5000, partes: [{ pessoaId: mae, bp: 10000 }] });
  mov({ valor: 1000, tipo: 'estorno', partes: [{ pessoaId: mae, bp: 10000 }] });
  mov({ valor: 9999, status: 'ignorada' });
  mov({ valor: 7777, ref: '2026-11', partes: [{ pessoaId: mae, bp: 10000 }] });
  assert.equal(de(totaisDaFatura(repo, cartao, '2026-10', eu), mae), 4000);
});

test('com pendência no fechamento só avisa pendências, sem totais', () => {
  const { repo, eu, mae, mov } = montar();
  mov({ partes: [{ pessoaId: mae, bp: 10000 }] });
  mov({ status: 'pendente' });
  const avisos = verificarFaturas(repo, '2026-10-16', eu);
  assert.deepEqual(avisos.map((a) => a.tipo), ['pendencias']);
  assert.equal(avisos[0].quantidade, 1);
  assert.equal(avisos[0].totais, undefined);
  assert.deepEqual(verificarFaturas(repo, '2026-10-16', eu), [], 'pendências avisadas uma vez por dia');
});

test('sem pendências envia o resumo uma única vez', () => {
  const { repo, eu, mae, mov } = montar();
  mov({ partes: [{ pessoaId: mae, bp: 10000 }] });
  const avisos = verificarFaturas(repo, '2026-10-16', eu);
  assert.deepEqual(avisos.map((a) => a.tipo), ['resumo']);
  assert.equal(de(avisos[0].totais, mae), 1000);
  assert.deepEqual(verificarFaturas(repo, '2026-10-16', eu), []);
  assert.deepEqual(verificarFaturas(repo, '2026-10-17', eu), []);
});

test('pendência resolvida depois do fechamento libera o resumo', () => {
  const { repo, eu, mae, mov } = montar();
  const p = mov({ status: 'pendente' });
  verificarFaturas(repo, '2026-10-16', eu);
  repo.gravarAtribuicoes(p, [{ pessoaId: mae, bp: 10000 }]);
  repo.marcarClassificada(p);
  assert.deepEqual(verificarFaturas(repo, '2026-10-17', eu).map((a) => a.tipo), ['resumo']);
});

test('fatura sem nenhuma movimentação ativa não gera aviso', () => {
  const { repo, eu, mov } = montar();
  mov({ status: 'ignorada' });
  assert.deepEqual(verificarFaturas(repo, '2026-10-16', eu), []);
});

test('vencimento aparece exatamente 3 dias antes', () => {
  const { repo, eu, mae, mov } = montar();
  mov({ partes: [{ pessoaId: mae, bp: 10000 }] });
  verificarFaturas(repo, '2026-10-16', eu);
  assert.deepEqual(verificarFaturas(repo, '2026-10-21', eu), []);
  const v = verificarFaturas(repo, '2026-10-22', eu);
  assert.deepEqual(v.map((a) => a.tipo), ['vencimento']);
  assert.equal(v[0].vencimento, '2026-10-25');
  assert.deepEqual(verificarFaturas(repo, '2026-10-22', eu), []);
  assert.deepEqual(verificarFaturas(repo, '2026-10-23', eu), []);
});

test('vencimento no mês seguinte quando vence antes do fechamento', () => {
  const { repo, eu, mae } = montar();
  const c2 = repo.upsertConta({ idExterno: 'mp', tipo: 'cartao', banco: 'mp', apelido: 'MP', diaFechamento: 28, diaVencimento: 5 });
  const id = repo.inserirMovimentacao({ idExterno: 'z', direcao: 'saida', tipo: 'compra_cartao', descricao: 'X', valorCentavos: 100, data: '2026-10-20' }, { contaId: c2, status: 'classificada', faturaRef: '2026-10' });
  repo.gravarAtribuicoes(id, [{ pessoaId: mae, bp: 10000 }]);
  verificarFaturas(repo, '2026-10-29', eu);
  const v = verificarFaturas(repo, '2026-11-02', eu).find((a) => a.contaId === c2);
  assert.equal(v?.vencimento, '2026-11-05');
});

test('textoAviso', () => {
  const pessoas = [{ id: 1, nome: 'eu' }, { id: 2, nome: 'mãe' }];
  assert.match(textoAviso({ tipo: 'pendencias', apelido: 'BB', ref: '2026-10', quantidade: 2 }, pessoas), /BB.*fechou.*2 compras sem dono/s);
  const t = textoAviso({ tipo: 'resumo', apelido: 'BB', ref: '2026-10', vencimento: '2026-10-25', totais: [{ pessoaId: 2, centavos: 1000 }, { pessoaId: 1, centavos: 50 }] }, pessoas);
  assert.match(t, /mãe: R\$ 10,00/);
  assert.match(t, /eu: R\$ 0,50/);
  assert.match(t, /Total: R\$ 10,50/);
  assert.match(t, /25\/10/);
});
