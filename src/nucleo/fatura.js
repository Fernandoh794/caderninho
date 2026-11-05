import { dividirCentavos, formatarReais } from './dinheiro.js';

const ultimoDia = (ano, mes) => new Date(Date.UTC(ano, mes, 0)).getUTCDate(); // mes 1..12

/**
 * Mês de referência ('AAAA-MM') da fatura em que uma compra cai: compras
 * depois do dia de fechamento vão para a fatura do mês seguinte. Fechamento
 * em dia que o mês não tem (31 em fevereiro) cai no último dia do mês.
 */
export function faturaRefDe(dataISO, diaFechamento) {
  const [ano, mes, dia] = dataISO.split('-').map(Number);
  const fechamento = Math.min(diaFechamento, ultimoDia(ano, mes));
  if (dia <= fechamento) return `${ano}-${String(mes).padStart(2, '0')}`;
  const proximo = mes === 12 ? [ano + 1, 1] : [ano, mes + 1];
  return `${proximo[0]}-${String(proximo[1]).padStart(2, '0')}`;
}


const pad = (n) => String(n).padStart(2, '0');
const mesAnterior = (ref) => {
  const [a, m] = ref.split('-').map(Number);
  return m === 1 ? `${a - 1}-12` : `${a}-${pad(m - 1)}`;
};
const mesSeguinte = (ref) => {
  const [a, m] = ref.split('-').map(Number);
  return m === 12 ? `${a + 1}-01` : `${a}-${pad(m + 1)}`;
};
const diaNoMes = (ref, dia) => {
  const [a, m] = ref.split('-').map(Number);
  return `${ref}-${pad(Math.min(dia, ultimoDia(a, m)))}`;
};
const somarDias = (dataISO, dias) => {
  const d = new Date(`${dataISO}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
};

/** Data de vencimento da fatura `ref`: no mesmo mês se vence depois do fechamento, senão no seguinte. */
export function vencimentoDe(ref, diaFechamento, diaVencimento) {
  return diaNoMes(diaVencimento > diaFechamento ? ref : mesSeguinte(ref), diaVencimento);
}

/**
 * Total por pessoa de uma fatura: compras somam, estornos subtraem. A sobra
 * de cada divisão vai para `pessoaSobraId`, então a soma bate com a fatura.
 * @returns {{pessoaId: number, centavos: number}[]}
 */
export function totaisDaFatura(repo, contaId, ref, pessoaSobraId) {
  const totais = new Map();
  for (const m of repo.listarMovimentacoes({ contaId, faturaRef: ref })) {
    if (m.status !== 'classificada' || !['compra_cartao', 'estorno'].includes(m.tipo)) continue;
    const sinal = m.tipo === 'estorno' ? -1 : 1;
    const atribuicoes = repo.atribuicoesDe(m.id);
    const partes = atribuicoes.length ? atribuicoes : [{ pessoaId: pessoaSobraId, bp: 10000 }];
    for (const p of dividirCentavos(m.valorCentavos, partes, pessoaSobraId)) {
      totais.set(p.pessoaId, (totais.get(p.pessoaId) ?? 0) + sinal * p.centavos);
    }
  }
  return [...totais].map(([pessoaId, centavos]) => ({ pessoaId, centavos })).filter((t) => t.centavos !== 0);
}

/**
 * @typedef {{tipo: 'pendencias', contaId: number, apelido: string, ref: string, quantidade: number}
 *   | {tipo: 'resumo'|'vencimento', contaId: number, apelido: string, ref: string, vencimento: string,
 *      totais: {pessoaId: number, centavos: number}[], pendentes?: number}} Aviso
 */

/**
 * Avisos de fatura para o dia. Considera a última fatura fechada de cada
 * cartão: com pendências, avisa (uma vez por dia) e não calcula totais; sem
 * pendências, envia o resumo uma única vez; 3 dias antes do vencimento,
 * lembra com os totais. Grava em `faturas` o que já foi enviado.
 * @returns {Aviso[]}
 */
export function verificarFaturas(repo, hoje, euId = repo.pessoaEu()?.id) {
  const avisos = [];
  const db = repo.db;
  for (const conta of repo.listarContas()) {
    if (conta.tipo !== 'cartao' || !conta.diaFechamento || !conta.diaVencimento) continue;
    const ref = mesAnterior(faturaRefDe(hoje, conta.diaFechamento));
    const movs = repo.listarMovimentacoes({ contaId: conta.id, faturaRef: ref }).filter((m) => m.status !== 'ignorada');
    if (movs.length === 0) continue;

    db.prepare('insert or ignore into faturas (conta_id, ref) values (?, ?)').run(conta.id, ref);
    db.prepare('update faturas set fechada = 1 where conta_id = ? and ref = ?').run(conta.id, ref);
    const fatura = db.prepare('select * from faturas where conta_id = ? and ref = ?').get(conta.id, ref);
    const pendentes = movs.filter((m) => m.status === 'pendente').length;
    const vencimento = vencimentoDe(ref, conta.diaFechamento, conta.diaVencimento);
    const base = { contaId: conta.id, apelido: conta.apelido, ref };

    if (!fatura.resumo_enviado) {
      if (pendentes > 0 && fatura.pendencias_avisadas_em !== hoje) {
        avisos.push({ tipo: 'pendencias', ...base, quantidade: pendentes });
        db.prepare('update faturas set pendencias_avisadas_em = ? where conta_id = ? and ref = ?').run(hoje, conta.id, ref);
      } else if (pendentes === 0) {
        avisos.push({ tipo: 'resumo', ...base, vencimento, totais: totaisDaFatura(repo, conta.id, ref, euId) });
        db.prepare('update faturas set resumo_enviado = 1 where conta_id = ? and ref = ?').run(conta.id, ref);
      }
    }

    if (!fatura.vencimento_avisado && hoje === somarDias(vencimento, -3)) {
      const aviso = { tipo: 'vencimento', ...base, vencimento, totais: totaisDaFatura(repo, conta.id, ref, euId) };
      if (pendentes) aviso.pendentes = pendentes;
      avisos.push(aviso);
      db.prepare('update faturas set vencimento_avisado = 1 where conta_id = ? and ref = ?').run(conta.id, ref);
    }
  }
  return avisos;
}

const dataCurta = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

/** Texto em português de um aviso de fatura. */
export function textoAviso(aviso, pessoas) {
  const nome = (id) => pessoas.find((p) => p.id === id)?.nome ?? '?';
  if (aviso.tipo === 'pendencias') {
    const s = aviso.quantidade === 1 ? 'compra sem dono' : 'compras sem dono';
    return `A fatura ${aviso.ref} do ${aviso.apelido} fechou e ainda tem ${aviso.quantidade} ${s}. Responda as perguntas (!pendentes) para eu fechar os totais.`;
  }
  const linhas = [...aviso.totais].sort((a, b) => b.centavos - a.centavos).map((t) => `${nome(t.pessoaId)}: ${formatarReais(t.centavos)}`);
  const total = aviso.totais.reduce((s, t) => s + t.centavos, 0);
  const cabecalho = aviso.tipo === 'resumo'
    ? `Fatura ${aviso.ref} do ${aviso.apelido} fechada. Vence em ${dataCurta(aviso.vencimento)}.`
    : `A fatura ${aviso.ref} do ${aviso.apelido} vence em ${dataCurta(aviso.vencimento)}.`;
  const alerta = aviso.pendentes ? `\nAtenção: ${aviso.pendentes} compra(s) ainda sem dono, os totais podem mudar.` : '';
  return `${cabecalho}\n${linhas.join('\n')}\nTotal: ${formatarReais(total)}${alerta}`;
}
