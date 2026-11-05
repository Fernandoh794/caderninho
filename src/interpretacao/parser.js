/**
 * Parser rígido das respostas do dono. Sem IA, sem rede: entende nomes,
 * apelidos, categorias, percentuais, sim/não e os comandos fixos.
 *
 * @typedef {{pessoaId: number, bp: number}} Parte
 * @typedef {{tipo: 'atribuicao', partes: Parte[], categoria?: string}
 *   | {tipo: 'categoria', categoria: string}
 *   | {tipo: 'confirmacao', valor: boolean}
 *   | {tipo: 'entrada', classe: 'renda'|'reembolso'}
 *   | {tipo: 'comando', nome: string, args: string[]}
 *   | {tipo: 'invalido', motivo: 'soma'|'desconhecido'}} Resultado
 * (resultados vindos de IA carregam também `precisaConfirmar: true`)
 */

export const normalizar = (s) => (s ?? '')
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/\s+/g, ' ').trim();

const SIM = new Set(['sim', 's', 'isso', 'ok', 'confirmo', 'confirma', 'pode', 'certo', 'yes', 'y']);
const NAO = new Set(['nao', 'n', 'no', 'errado', 'cancela']);
const DESCONHECIDO = { tipo: 'invalido', motivo: 'desconhecido' };

const RE_ORCAMENTO = /^or[cç]amento\s+(.+?)\s+(\d+(?:[.,]\d{1,2})?)$/i;
const RE_CONTA = /^conta\s+(.+?)\s+(\d+(?:[.,]\d{1,2})?)\s+dia\s+(\d{1,2})$/i;
const RE_PAGUEI = /^paguei\s+(.+)$/i;

/**
 * @param {string} texto
 * @param {{pessoas: {id: number, nome: string, apelidos: string[], ehEu: boolean}[], categorias: string[]}} ctx
 * @returns {Resultado}
 */
export function interpretarResposta(texto, ctx) {
  const original = (texto ?? '').replace(/\s+/g, ' ').trim();
  const t = normalizar(original);
  if (!t) return DESCONHECIDO;

  if (t.startsWith('!')) {
    const [nome, ...args] = original.slice(1).trim().split(' ');
    return nome ? { tipo: 'comando', nome: normalizar(nome), args } : DESCONHECIDO;
  }
  let m;
  if ((m = original.match(RE_ORCAMENTO))) return { tipo: 'comando', nome: 'orcamento', args: [m[1], m[2]] };
  if ((m = original.match(RE_CONTA))) return { tipo: 'comando', nome: 'conta', args: [m[1], m[2], m[3]] };
  if ((m = original.match(RE_PAGUEI))) return { tipo: 'comando', nome: 'paguei', args: [m[1]] };

  const limpo = t.replace(/[.!?]+$/, '');
  if (SIM.has(limpo)) return { tipo: 'confirmacao', valor: true };
  if (NAO.has(limpo)) return { tipo: 'confirmacao', valor: false };
  if (limpo === 'renda') return { tipo: 'entrada', classe: 'renda' };
  if (limpo === 'reembolso') return { tipo: 'entrada', classe: 'reembolso' };

  const categorias = ctx.categorias.map((c) => ({ nome: c, chave: normalizar(c) }));
  const soCategoria = categorias.find((c) => c.chave === limpo);
  if (soCategoria) return { tipo: 'categoria', categoria: soCategoria.nome };

  return interpretarAtribuicao(limpo, ctx, categorias);
}

function interpretarAtribuicao(t, ctx, categorias) {
  // categoria no fim do texto ("mãe alimentação fora"); a mais longa vence
  let categoria;
  let resto = t;
  for (const c of [...categorias].sort((a, b) => b.chave.length - a.chave.length)) {
    if (resto === c.chave || resto.endsWith(` ${c.chave}`) || resto.endsWith(`,${c.chave}`)) {
      categoria = c.nome;
      resto = resto.slice(0, resto.length - c.chave.length);
      break;
    }
  }

  const tokens = resto.replace(/(?<!\d),|,(?!\d)/g, ' ').replace(/[;/+]/g, ' ').split(' ').filter((x) => x && x !== 'e' && x !== 'com' && x !== 'da' && x !== 'do' && x !== 'de');
  const nomes = [];
  for (const p of ctx.pessoas) {
    for (const n of [p.nome, ...p.apelidos]) nomes.push({ tokens: normalizar(n).split(' '), pessoa: p });
  }
  nomes.sort((a, b) => b.tokens.length - a.tokens.length);

  /** @type {{pessoa: object, pct: number|null}[]} */
  const itens = [];
  for (let i = 0; i < tokens.length;) {
    const num = tokens[i].match(/^(\d{1,3}(?:[.,]\d{1,2})?)%?$/);
    if (num) {
      const anterior = itens.at(-1);
      if (!anterior || anterior.pct !== null) return DESCONHECIDO;
      anterior.pct = Number(num[1].replace(',', '.'));
      i++;
      continue;
    }
    if (tokens[i] === '%') { i++; continue; }
    const achado = nomes.find((n) => n.tokens.every((tk, k) => tokens[i + k] === tk));
    if (!achado) return DESCONHECIDO;
    if (itens.some((x) => x.pessoa.id === achado.pessoa.id)) return DESCONHECIDO;
    itens.push({ pessoa: achado.pessoa, pct: null });
    i += achado.tokens.length;
  }
  if (itens.length === 0) return DESCONHECIDO;

  const partes = calcularPartes(itens, ctx.pessoas.find((p) => p.ehEu));
  if (!partes) return { tipo: 'invalido', motivo: 'soma' };
  const r = { tipo: 'atribuicao', partes };
  if (categoria) r.categoria = categoria;
  return r;
}

function calcularPartes(itens, eu) {
  const comPct = itens.filter((x) => x.pct !== null);
  const semPct = itens.filter((x) => x.pct === null);
  const bp = (pct) => Math.round(pct * 100);
  const somaBp = comPct.reduce((s, x) => s + bp(x.pct), 0);
  if (comPct.some((x) => x.pct <= 0) || somaBp > 10000) return null;

  const partes = comPct.map((x) => ({ pessoaId: x.pessoa.id, bp: bp(x.pct) }));
  const restante = 10000 - somaBp;

  if (semPct.length === 0) {
    if (restante === 0) return partes;
    // "irmã 50%": o resto é do dono, mas só se ele não foi citado com outro valor
    if (comPct.length === 1 && eu && comPct[0].pessoa.id !== eu.id) return [...partes, { pessoaId: eu.id, bp: restante }];
    return null;
  }
  if (restante === 0) return null;

  const cada = Math.floor(restante / semPct.length);
  const divididas = semPct.map((x) => ({ pessoaId: x.pessoa.id, bp: cada }));
  const sobra = restante - cada * semPct.length;
  if (sobra) (divididas.find((p) => p.pessoaId === eu?.id) ?? divididas[0]).bp += sobra;
  return [...partes, ...divididas];
}
