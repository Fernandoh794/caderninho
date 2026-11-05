import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { criarFontePluggy } from '../../src/adaptadores/pluggy/fonte.js';
import { mapearTransacao } from '../../src/adaptadores/pluggy/mapear.js';
import { ErroLimite } from '../../src/portas/fonte.js';
import { testarContratoFonte } from '../contratos/fonte.js';

// Fixtures SINTÉTICAS (ver test/fixtures/pluggy/LEIAME.md).
const lerJson = (nome) => JSON.parse(readFileSync(new URL(`../fixtures/pluggy/${nome}`, import.meta.url)));
const item = lerJson('item-bb.json');
const contas = lerJson('contas-bb.json');
const paginas = {
  'conta-cartao-bb': lerJson('transacoes-cartao-bb.json').paginas,
  'conta-corrente-bb': lerJson('transacoes-corrente-bb.json').paginas,
};
const cartao = contas.results[0];
const corrente = contas.results[1];
const todas = (id) => paginas[id].flatMap((p) => p.results);
const tx = (id, nome) => todas(id).find((t) => t.id === nome);

function fetchFalso({ status } = {}) {
  const chamadas = [];
  const f = async (url, init = {}) => {
    const u = new URL(url);
    chamadas.push({ url: u, init });
    const json = (corpo, st = 200) => new Response(JSON.stringify(corpo), { status: st });
    if (u.pathname === '/auth') return json({ apiKey: 'chave-1' });
    if (status && u.pathname !== '/auth') return json({}, status);
    if (u.pathname === '/items/item-bb') return json(item);
    if (u.pathname === '/accounts') return json(contas);
    if (u.pathname === '/transactions') {
      const lista = paginas[u.searchParams.get('accountId')];
      return json(lista[Number(u.searchParams.get('page') ?? 1) - 1]);
    }
    return json({}, 404);
  };
  f.chamadas = chamadas;
  return f;
}

const criar = (fetch = fetchFalso()) =>
  criarFontePluggy({ clientId: 'id', clientSecret: 'segredo', itemIds: ['item-bb'], fetch });

testarContratoFonte('pluggy (fetch falso)', () => criar());

test('compra de cartão (positiva) vira saída/compra_cartao', () => {
  const m = mapearTransacao(tx('conta-cartao-bb', 't-cartao-1'), { idExterno: 'conta-cartao-bb', tipo: 'cartao' });
  assert.deepEqual(m, { idExterno: 't-cartao-1', contaExternaId: 'conta-cartao-bb', direcao: 'saida', tipo: 'compra_cartao', descricao: 'SUPERMERCADO EXEMPLO', valorCentavos: 12345, data: '2026-10-03' });
});

test('valor negativo em cartão é estorno: entrada com valor positivo', () => {
  const m = mapearTransacao(tx('conta-cartao-bb', 't-cartao-3'), { idExterno: 'conta-cartao-bb', tipo: 'cartao' });
  assert.equal(m.direcao, 'entrada');
  assert.equal(m.tipo, 'estorno');
  assert.equal(m.valorCentavos, 3590);
});

test('pagamento de fatura é reconhecido no cartão e na conta', () => {
  const noCartao = mapearTransacao(tx('conta-cartao-bb', 't-cartao-4'), { idExterno: 'conta-cartao-bb', tipo: 'cartao' });
  assert.equal(noCartao.tipo, 'pagamento_fatura');
  assert.equal(noCartao.direcao, 'entrada');
  assert.equal(noCartao.valorCentavos, 50000);
  const naConta = mapearTransacao({ id: 'x', description: 'PAGTO FATURA CARTAO', amount: -500, date: '2026-10-10T12:00:00.000Z' }, { idExterno: 'c', tipo: 'corrente' });
  assert.equal(naConta.tipo, 'pagamento_fatura');
  assert.equal(naConta.direcao, 'saida');
});

test('conta corrente: negativa é saída, positiva é entrada', () => {
  const c = { idExterno: 'conta-corrente-bb', tipo: 'corrente' };
  assert.equal(mapearTransacao(tx('conta-corrente-bb', 't-cc-3'), c).direcao, 'saida');
  assert.equal(mapearTransacao(tx('conta-corrente-bb', 't-cc-4'), c).direcao, 'entrada');
});

test('Pix é reconhecido pelo tipo de operação e pela descrição', () => {
  const c = { idExterno: 'conta-corrente-bb', tipo: 'corrente' };
  const enviado = mapearTransacao(tx('conta-corrente-bb', 't-cc-1'), c);
  assert.equal(enviado.tipo, 'pix');
  assert.equal(enviado.direcao, 'saida');
  assert.equal(enviado.valorCentavos, 8000);
  assert.equal(mapearTransacao(tx('conta-corrente-bb', 't-cc-2'), c).tipo, 'pix');
  const porDescricao = mapearTransacao({ id: 'y', description: 'PIX ENVIADO MERCADO', amount: -9.9, date: '2026-10-01T12:00:00.000Z' }, c);
  assert.equal(porDescricao.tipo, 'pix');
});

test('débito e transferência na conta corrente', () => {
  const c = { idExterno: 'conta-corrente-bb', tipo: 'corrente' };
  assert.equal(mapearTransacao(tx('conta-corrente-bb', 't-cc-3'), c).tipo, 'debito');
  assert.equal(mapearTransacao(tx('conta-corrente-bb', 't-cc-4'), c).tipo, 'transferencia');
});

test('parcelas vêm de creditCardMetadata; compra à vista não leva campos de parcela', () => {
  const c = { idExterno: 'conta-cartao-bb', tipo: 'cartao' };
  const p = mapearTransacao(tx('conta-cartao-bb', 't-cartao-2'), c);
  assert.equal(p.parcelaAtual, 2);
  assert.equal(p.totalParcelas, 6);
  assert.equal(p.valorTotalCentavos, 60000);
  const avista = mapearTransacao(tx('conta-cartao-bb', 't-cartao-5'), c);
  assert.ok(!('parcelaAtual' in avista) && !('totalParcelas' in avista) && !('valorTotalCentavos' in avista));
});

test('listarContas traz banco, tipo e dias de fechamento e vencimento', async () => {
  const lista = await criar().listarContas();
  assert.deepEqual(lista, [
    { idExterno: 'conta-cartao-bb', tipo: 'cartao', banco: 'Banco do Brasil', apelido: 'Banco do Brasil Ourocard', diaFechamento: 15, diaVencimento: 25 },
    { idExterno: 'conta-corrente-bb', tipo: 'corrente', banco: 'Banco do Brasil', apelido: 'Banco do Brasil Conta Corrente' },
  ]);
});

test('segue a paginação até o fim', async () => {
  const f = fetchFalso();
  const movs = await criar(f).listarMovimentacoes('conta-cartao-bb', '1900-01-01');
  assert.equal(movs.length, 5);
  const paginasPedidas = f.chamadas.filter((c) => c.url.pathname === '/transactions').map((c) => c.url.searchParams.get('page'));
  assert.deepEqual(paginasPedidas, ['1', '2']);
});

test('desde filtra por data e vai como parâmetro from', async () => {
  const f = fetchFalso();
  const movs = await criar(f).listarMovimentacoes('conta-cartao-bb', '2026-10-10');
  assert.deepEqual(movs.map((m) => m.idExterno), ['t-cartao-4', 't-cartao-5']);
  assert.equal(f.chamadas.find((c) => c.url.pathname === '/transactions').url.searchParams.get('from'), '2026-10-10');
});

test('o token é reutilizado entre chamadas e enviado em X-API-KEY', async () => {
  const f = fetchFalso();
  const fonte = criar(f);
  await fonte.listarContas();
  await fonte.listarMovimentacoes('conta-cartao-bb', '1900-01-01');
  await fonte.listarMovimentacoes('conta-corrente-bb', '1900-01-01');
  assert.equal(f.chamadas.filter((c) => c.url.pathname === '/auth').length, 1);
  assert.ok(f.chamadas.filter((c) => c.url.pathname !== '/auth').every((c) => c.init.headers['X-API-KEY'] === 'chave-1'));
});

test('HTTP 429 lança ErroLimite', async () => {
  await assert.rejects(criar(fetchFalso({ status: 429 })).listarContas(), ErroLimite);
});

test('operationType tem prioridade sobre a descrição (valores informados pela IA da Pluggy, a confirmar no spike)', () => {
  const card = { idExterno: 'c', tipo: 'cartao' };
  const cc = { idExterno: 'cc', tipo: 'corrente' };
  const base = { id: 'z', date: '2026-10-01T12:00:00.000Z' };
  const fatura = mapearTransacao({ ...base, description: 'CREDITO EM CONTA', amount: -200, operationType: 'PAGAMENTO_FATURA' }, card);
  assert.equal(fatura.tipo, 'pagamento_fatura');
  assert.equal(fatura.direcao, 'entrada');
  assert.equal(mapearTransacao({ ...base, description: 'ENTRE CONTAS', amount: -50, operationType: 'TRANSFERENCIA_MESMA_INSTITUICAO' }, cc).tipo, 'transferencia');
  assert.equal(mapearTransacao({ ...base, description: 'LOJA X', amount: -20, operationType: 'ESTORNO' }, card).tipo, 'estorno');
  assert.equal(mapearTransacao({ ...base, description: 'QUALQUER', amount: -9, operationType: 'PIX' }, cc).tipo, 'pix');
});
