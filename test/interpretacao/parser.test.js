import { test } from 'node:test';
import assert from 'node:assert/strict';
import { interpretarResposta } from '../../src/interpretacao/parser.js';

const ctx = {
  pessoas: [
    { id: 1, nome: 'eu', apelidos: ['minha'], ehEu: true },
    { id: 2, nome: 'mãe', apelidos: ['mamãe', 'mae'], ehEu: false },
    { id: 3, nome: 'irmã', apelidos: ['mana'], ehEu: false },
    { id: 4, nome: 'irmão', apelidos: ['mano'], ehEu: false },
  ],
  categorias: ['mercado', 'alimentação fora', 'lazer', 'transporte', 'moradia', 'saúde', 'assinaturas', 'compras', 'outros'],
};
const r = (texto) => interpretarResposta(texto, ctx);
const ordenar = (partes) => [...partes].sort((a, b) => a.pessoaId - b.pessoaId);

const casos = [
  ['mãe', { tipo: 'atribuicao', partes: [{ pessoaId: 2, bp: 10000 }] }],
  ['MAMÃE', { tipo: 'atribuicao', partes: [{ pessoaId: 2, bp: 10000 }] }],
  ['irmã 50%', { tipo: 'atribuicao', partes: [{ pessoaId: 1, bp: 5000 }, { pessoaId: 3, bp: 5000 }] }],
  ['mãe 30, eu 70', { tipo: 'atribuicao', partes: [{ pessoaId: 1, bp: 7000 }, { pessoaId: 2, bp: 3000 }] }],
  ['mãe mercado', { tipo: 'atribuicao', partes: [{ pessoaId: 2, bp: 10000 }], categoria: 'mercado' }],
  ['mana e mano, alimentação fora', { tipo: 'atribuicao', partes: [{ pessoaId: 3, bp: 5000 }, { pessoaId: 4, bp: 5000 }], categoria: 'alimentação fora' }],
  ['mãe 60 irmã', { tipo: 'atribuicao', partes: [{ pessoaId: 2, bp: 6000 }, { pessoaId: 3, bp: 4000 }] }],
  ['mãe 33,4% irmã 33,3% eu 33,3%', { tipo: 'atribuicao', partes: [{ pessoaId: 1, bp: 3330 }, { pessoaId: 2, bp: 3340 }, { pessoaId: 3, bp: 3330 }] }],
  ['mãe, irmã e eu', { tipo: 'atribuicao', partes: [{ pessoaId: 1, bp: 3334 }, { pessoaId: 2, bp: 3333 }, { pessoaId: 3, bp: 3333 }] }],
  ['mãe 60, irmã 60', { tipo: 'invalido', motivo: 'soma' }],
  ['mãe 120', { tipo: 'invalido', motivo: 'soma' }],
  ['mãe 30, irmã 30', { tipo: 'invalido', motivo: 'soma' }],
  ['sim', { tipo: 'confirmacao', valor: true }],
  ['s', { tipo: 'confirmacao', valor: true }],
  ['Isso', { tipo: 'confirmacao', valor: true }],
  ['não', { tipo: 'confirmacao', valor: false }],
  ['nao', { tipo: 'confirmacao', valor: false }],
  ['renda', { tipo: 'entrada', classe: 'renda' }],
  ['Reembolso', { tipo: 'entrada', classe: 'reembolso' }],
  ['mercado', { tipo: 'categoria', categoria: 'mercado' }],
  ['saude', { tipo: 'categoria', categoria: 'saúde' }],
  ['!gastos', { tipo: 'comando', nome: 'gastos', args: [] }],
  ['!Fatura bb', { tipo: 'comando', nome: 'fatura', args: ['bb'] }],
  ['orçamento lazer 500', { tipo: 'comando', nome: 'orcamento', args: ['lazer', '500'] }],
  ['orçamento alimentação fora 350,50', { tipo: 'comando', nome: 'orcamento', args: ['alimentação fora', '350,50'] }],
  ['conta internet 120 dia 10', { tipo: 'comando', nome: 'conta', args: ['internet', '120', '10'] }],
  ['conta Plano de Saúde 450,90 dia 5', { tipo: 'comando', nome: 'conta', args: ['Plano de Saúde', '450,90', '5'] }],
  ['paguei internet', { tipo: 'comando', nome: 'paguei', args: ['internet'] }],
  ['qualquer coisa estranha', { tipo: 'invalido', motivo: 'desconhecido' }],
  ['mãe pizza', { tipo: 'invalido', motivo: 'desconhecido' }],
  ['', { tipo: 'invalido', motivo: 'desconhecido' }],
];

for (const [texto, esperado] of casos) {
  test(`"${texto}"`, () => {
    const obtido = r(texto);
    if (obtido.partes) obtido.partes = ordenar(obtido.partes);
    assert.deepEqual(obtido, esperado);
  });
}
