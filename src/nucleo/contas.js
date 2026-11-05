import { normalizar } from '../interpretacao/parser.js';

const pad = (n) => String(n).padStart(2, '0');
const ultimoDia = (ano, mes) => new Date(Date.UTC(ano, mes, 0)).getUTCDate();
const vencimentoNoMes = (ano, mes, dia) => `${ano}-${pad(mes)}-${pad(Math.min(dia, ultimoDia(ano, mes)))}`;
const somarDias = (iso, n) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

function linhas(repo) {
  return repo.db.prepare(`select id, nome, valor_centavos valorCentavos, dia, pago_mes pagoMes, ultimo_lembrete ultimoLembrete
    from contas_a_pagar order by dia, nome`).all().map((r) => ({ ...r }));
}

/** Vencimento ainda não pago mais próximo, a partir de `hoje` (este mês ou o próximo). */
function proximoVencimento(conta, hoje) {
  const [ano, mes] = hoje.split('-').map(Number);
  const candidatos = [[ano, mes], mes === 12 ? [ano + 1, 1] : [ano, mes + 1]];
  for (const [a, m] of candidatos) {
    const venc = vencimentoNoMes(a, m, conta.dia);
    if (venc >= hoje && conta.pagoMes !== venc.slice(0, 7)) return venc;
  }
  return null;
}

export function cadastrarConta(repo, nome, valorCentavos, dia) {
  if (!Number.isInteger(dia) || dia < 1 || dia > 31) throw new Error('dia precisa estar entre 1 e 31');
  repo.db.prepare(`insert into contas_a_pagar (nome, nome_norm, valor_centavos, dia) values (?, ?, ?, ?)
    on conflict (nome_norm) do update set valor_centavos = excluded.valor_centavos, dia = excluded.dia`)
    .run(nome, normalizar(nome), valorCentavos, dia);
}

/** @returns {boolean} false quando não há conta com esse nome */
export function marcarPaga(repo, nome, mes) {
  return repo.db.prepare('update contas_a_pagar set pago_mes = ? where nome_norm = ?').run(mes, normalizar(nome)).changes > 0;
}

/**
 * Lembretes de hoje: 3 dias antes e no dia do vencimento, uma vez por dia,
 * nunca para conta já paga naquele mês.
 * @returns {{nome: string, valorCentavos: number, vencimento: string, quando: 'em3dias'|'hoje'}[]}
 */
export function lembretesDoDia(repo, hoje) {
  const lembretes = [];
  for (const c of linhas(repo)) {
    if (c.ultimoLembrete === hoje) continue;
    const venc = proximoVencimento(c, hoje);
    if (!venc) continue;
    const quando = venc === hoje ? 'hoje' : venc === somarDias(hoje, 3) ? 'em3dias' : null;
    if (!quando) continue;
    lembretes.push({ nome: c.nome, valorCentavos: c.valorCentavos, vencimento: venc, quando });
    repo.db.prepare('update contas_a_pagar set ultimo_lembrete = ? where id = ?').run(hoje, c.id);
  }
  return lembretes;
}

/** Para o !contas: próximos vencimentos não pagos, do mais próximo ao mais distante. */
export function proximosVencimentos(repo, hoje) {
  return linhas(repo)
    .map((c) => ({ nome: c.nome, valorCentavos: c.valorCentavos, vencimento: proximoVencimento(c, hoje) }))
    .filter((c) => c.vencimento)
    .sort((a, b) => a.vencimento.localeCompare(b.vencimento));
}
