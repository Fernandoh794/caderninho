import { test } from 'node:test';
import assert from 'node:assert/strict';
import { testarContratoFonte } from './contratos/fonte.js';
import { testarContratoMensageiro } from './contratos/mensageiro.js';
import { criarFonteFalsa } from '../src/falsos/fonte.js';
import { criarMensageiroFalso } from '../src/falsos/mensageiro.js';
import { criarTranscritorFalso } from '../src/falsos/transcritor.js';
import { criarInterpretadorFalso } from '../src/falsos/interpretador.js';
import { ErroLimite } from '../src/portas/fonte.js';

const conta = { idExterno: 'c1', tipo: 'cartao', banco: 'bb', apelido: 'BB' };
const mov = (id, data) => ({ idExterno: id, contaExternaId: 'c1', direcao: 'saida', tipo: 'compra_cartao', descricao: 'X', valorCentavos: 100, data });

testarContratoFonte('fonte falsa', () => criarFonteFalsa({ contas: [conta], movimentacoes: [mov('a', '2026-10-01'), mov('b', '2026-11-01')] }));

testarContratoMensageiro('mensageiro falso', () => {
  const mensageiro = criarMensageiroFalso();
  return { mensageiro, simularRecebida: (m) => mensageiro.simular(m) };
});

test('mensageiro falso registra enviadas', async () => {
  const m = criarMensageiroFalso();
  await m.enviar('olá');
  assert.deepEqual(m.enviadas.map((e) => e.texto), ['olá']);
});

test('fonte falsa pode lançar ErroLimite', async () => {
  const f = criarFonteFalsa({ contas: [conta], movimentacoes: [], erro: new ErroLimite('limite') });
  await assert.rejects(() => f.listarMovimentacoes('c1', '2026-01-01'), ErroLimite);
});

test('transcritor e interpretador falsos', async () => {
  const t = criarTranscritorFalso({ texto: 'mãe mercado' });
  assert.equal(await t.transcrever(Buffer.from(''), 'audio/ogg'), 'mãe mercado');
  assert.equal(t.chamadas.length, 1);
  const i = criarInterpretadorFalso({ resultado: { tipo: 'categoria', categoria: 'lazer' }, sugestao: 'lazer' });
  assert.equal((await i.interpretar('x', {})).precisaConfirmar, true);
  assert.equal(await i.sugerirCategoria('cinema', ['lazer']), 'lazer');
});
