import { formatarReais } from './nucleo/dinheiro.js';
import { faturaRefDe, totaisDaFatura } from './nucleo/fatura.js';
import { gastoRealPorCategoria, textoGastos } from './nucleo/gasto.js';
import { definirOrcamento, listarOrcamentos } from './nucleo/orcamento.js';
import { cadastrarConta, marcarPaga, proximosVencimentos } from './nucleo/contas.js';
import { normalizar } from './interpretacao/parser.js';

export const AJUDA = `Comandos:
!pendentes — o que falta classificar
!fatura — fatura aberta de cada cartão, por pessoa
!gastos — seus gastos do mês e o saldo de cada orçamento
!contas — próximos vencimentos
orçamento <categoria> <valor> — ex.: orçamento lazer 500
conta <nome> <valor> dia <dia> — ex.: conta internet 120 dia 10
paguei <nome> — ex.: paguei internet
!cartao <apelido> <dia fechamento> <dia vencimento> — ex.: !cartao BB 15 25`;

const dataCurta = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

/** "500" → 50000; "350,50" → 35050; "1.200,00" → 120000. */
export function lerValor(texto) {
  const t = String(texto ?? '').trim().replace(/^r\$\s*/i, '');
  let n;
  if (/^\d{1,3}(\.\d{3})+(,\d{1,2})?$/.test(t)) n = Number(t.replace(/\./g, '').replace(',', '.'));
  else if (/^\d+([.,]\d{1,2})?$/.test(t)) n = Number(t.replace(',', '.'));
  else return null;
  return Math.round(n * 100);
}

function pendentes({ repo }) {
  const lista = repo.listarPendentes();
  if (!lista.length) return 'Nada pendente. 🎉';
  const linhas = lista.slice(0, 10).map((m) => `${dataCurta(m.data)} ${m.descricao}, ${formatarReais(m.valorCentavos)} (${m.contaApelido})`);
  const mais = lista.length > 10 ? `\n…e mais ${lista.length - 10}.` : '';
  return `${lista.length} pendente(s):\n${linhas.join('\n')}${mais}\nVou perguntando de 5 em 5; responda as perguntas abertas.`;
}

function fatura({ repo, hoje, euId }, [filtro]) {
  const pessoas = repo.listarPessoas();
  const nome = (id) => pessoas.find((p) => p.id === id)?.nome ?? '?';
  const cartoes = repo.listarContas().filter((c) => c.tipo === 'cartao' && (!filtro || normalizar(c.apelido) === normalizar(filtro)));
  if (!cartoes.length) return filtro ? `Não achei o cartão "${filtro}".` : 'Nenhum cartão cadastrado ainda.';
  return cartoes.map((c) => {
    if (!c.diaFechamento) return `${c.apelido}: sem dia de fechamento. Use !cartao ${c.apelido} <fechamento> <vencimento>.`;
    const ref = faturaRefDe(hoje, c.diaFechamento);
    const totais = totaisDaFatura(repo, c.id, ref, euId).sort((a, b) => b.centavos - a.centavos);
    const semDono = repo.listarMovimentacoes({ contaId: c.id, faturaRef: ref }).filter((m) => m.status === 'pendente').length;
    const total = totais.reduce((s, t) => s + t.centavos, 0);
    const linhas = totais.map((t) => `  ${nome(t.pessoaId)}: ${formatarReais(t.centavos)}`);
    const aviso = semDono ? `\n  (${semDono} sem dono ainda)` : '';
    return `${c.apelido} — fatura ${ref} (aberta, fecha dia ${c.diaFechamento})\n${linhas.join('\n') || '  nada classificado'}\n  Total: ${formatarReais(total)}${aviso}`;
  }).join('\n\n');
}

function gastos({ repo, hoje, euId }) {
  const mes = hoje.slice(0, 7);
  return textoGastos(gastoRealPorCategoria(repo, mes, euId), listarOrcamentos(repo), mes);
}

function contas({ repo, hoje }) {
  const lista = proximosVencimentos(repo, hoje);
  if (!lista.length) return 'Nenhuma conta cadastrada. Ex.: conta internet 120 dia 10';
  return `Próximos vencimentos:\n${lista.map((c) => `${dataCurta(c.vencimento)} ${c.nome}: ${formatarReais(c.valorCentavos)}`).join('\n')}`;
}

function orcamento({ repo }, [categoria, valor]) {
  const cat = repo.listarCategorias().find((c) => normalizar(c) === normalizar(categoria));
  if (!cat) return `Não conheço a categoria "${categoria}". Categorias: ${repo.listarCategorias().join(', ')}.`;
  const centavos = lerValor(valor);
  if (!centavos) return 'Valor inválido. Ex.: orçamento lazer 500';
  definirOrcamento(repo, cat, centavos);
  return `Orçamento de ${cat}: ${formatarReais(centavos)} por mês.`;
}

function conta({ repo }, [nome, valor, dia]) {
  const centavos = lerValor(valor);
  const d = Number(dia);
  if (!nome || !centavos || !Number.isInteger(d) || d < 1 || d > 31) return 'Formato: conta <nome> <valor> dia <dia>. Ex.: conta internet 120 dia 10';
  cadastrarConta(repo, nome, centavos, d);
  return `Conta ${nome}: ${formatarReais(centavos)} todo dia ${d}. Lembro 3 dias antes e no dia.`;
}

function paguei({ repo, hoje }, [nome]) {
  const alvo = proximosVencimentos(repo, hoje).find((c) => normalizar(c.nome) === normalizar(nome));
  if (!alvo) return `Não achei conta em aberto chamada "${nome}". Veja !contas.`;
  marcarPaga(repo, alvo.nome, alvo.vencimento.slice(0, 7));
  return `${alvo.nome} de ${alvo.vencimento.slice(5, 7)}/${alvo.vencimento.slice(0, 4)} marcada como paga.`;
}

function cartao({ repo }, [apelido, fechamento, vencimento]) {
  const c = repo.listarContas().find((x) => normalizar(x.apelido) === normalizar(apelido));
  const f = Number(fechamento);
  const v = Number(vencimento);
  if (!c) return `Não achei a conta "${apelido}". Contas: ${repo.listarContas().map((x) => x.apelido).join(', ')}.`;
  if (![f, v].every((n) => Number.isInteger(n) && n >= 1 && n <= 31)) return 'Formato: !cartao <apelido> <dia fechamento> <dia vencimento>';
  repo.db.prepare("update contas set tipo = 'cartao', dia_fechamento = ?, dia_vencimento = ? where id = ?").run(f, v, c.id);
  return `${c.apelido}: fecha dia ${f}, vence dia ${v}.`;
}

const COMANDOS = { pendentes, fatura, gastos, contas, orcamento, conta, paguei, cartao, ajuda: () => AJUDA };

/** @returns {string} resposta ao dono */
export function executarComando(nome, args, ctx) {
  const fn = COMANDOS[normalizar(nome)];
  return fn ? fn(ctx, args) : AJUDA;
}
