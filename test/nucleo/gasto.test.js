import { test } from 'node:test';
import assert from 'node:assert/strict';
import { abrirBanco } from '../../src/db/abrir.js';
import { criarRepositorio } from '../../src/db/repositorio.js';
import { gastoRealPorCategoria, textoGastos } from '../../src/nucleo/gasto.js';

function montar() {
  const repo = criarRepositorio(abrirBanco());
  const eu = repo.criarPessoa({ nome: 'eu', ehEu: true });
  const mae = repo.criarPessoa({ nome: 'mãe' });
  const cartao = repo.upsertConta({ idExterno: 'cc', tipo: 'cartao', banco: 'bb', apelido: 'BB', diaFechamento: 15, diaVencimento: 25 });
  const conta = repo.upsertConta({ idExterno: 'cr', tipo: 'corrente', banco: 'inter', apelido: 'Inter' });
  let seq = 0;
  const mov = ({ contaId = conta, tipo = 'pix', direcao = 'saida', valor, categoria, data = '2026-11-03', partes, status = 'classificada' }) => {
    const id = repo.inserirMovimentacao({ idExterno: `t${++seq}`, direcao, tipo, descricao: 'X', valorCentavos: valor, data }, { contaId, status, categoria });
    if (partes) repo.gravarAtribuicoes(id, partes);
    return id;
  };
  return { repo, eu, mae, cartao, conta, mov, gasto: () => gastoRealPorCategoria(repo, '2026-11', eu) };
}

test('Pix de R$ 142 em mercado soma', () => {
  const { mov, gasto } = montar();
  mov({ valor: 14200, categoria: 'mercado' });
  mov({ valor: 1000, tipo: 'debito', categoria: 'mercado' });
  assert.equal(gasto().get('mercado'), 15200);
});

test('compra da mãe não soma; eu 40% soma 40%', () => {
  const { mov, gasto, cartao, eu, mae } = montar();
  mov({ contaId: cartao, tipo: 'compra_cartao', valor: 10000, categoria: 'lazer', partes: [{ pessoaId: mae, bp: 10000 }] });
  mov({ contaId: cartao, tipo: 'compra_cartao', valor: 10000, categoria: 'compras', partes: [{ pessoaId: eu, bp: 4000 }, { pessoaId: mae, bp: 6000 }] });
  const g = gasto();
  assert.equal(g.get('lazer') ?? 0, 0);
  assert.equal(g.get('compras'), 4000);
});

test('pagamento de fatura, transferência e entradas não somam', () => {
  const { mov, gasto } = montar();
  mov({ valor: 200000, tipo: 'pagamento_fatura' });
  mov({ valor: 50000, tipo: 'transferencia' });
  mov({ valor: 650000, direcao: 'entrada', categoria: 'renda' });
  mov({ valor: 3000, direcao: 'entrada', categoria: 'reembolso' });
  assert.equal(gasto().size, 0);
});

test('estorno do dono reduz a categoria', () => {
  const { mov, gasto, cartao, eu } = montar();
  mov({ contaId: cartao, tipo: 'compra_cartao', valor: 10000, categoria: 'lazer', partes: [{ pessoaId: eu, bp: 10000 }] });
  mov({ contaId: cartao, tipo: 'estorno', direcao: 'entrada', valor: 3000, categoria: 'lazer', partes: [{ pessoaId: eu, bp: 10000 }] });
  assert.equal(gasto().get('lazer'), 7000);
});

test('mês anterior e pendentes não entram', () => {
  const { mov, gasto } = montar();
  mov({ valor: 5000, categoria: 'mercado', data: '2026-10-31' });
  mov({ valor: 5000, categoria: 'mercado', status: 'pendente' });
  assert.equal(gasto().get('mercado') ?? 0, 0);
});

test('textoGastos mostra o que falta de cada orçamento', () => {
  const t = textoGastos(new Map([['mercado', 14200], ['lazer', 60000]]), [{ categoria: 'mercado', limiteCentavos: 50000 }, { categoria: 'lazer', limiteCentavos: 50000 }], '2026-11');
  assert.match(t, /mercado: R\$ 142,00 de R\$ 500,00 \(faltam R\$ 358,00\)/);
  assert.match(t, /lazer: R\$ 600,00 de R\$ 500,00 \(estourou R\$ 100,00\)/);
  assert.match(t, /Total: R\$ 742,00/);
});
