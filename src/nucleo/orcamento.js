import { gastoRealPorCategoria } from './gasto.js';
import { formatarReais } from './dinheiro.js';

export function definirOrcamento(repo, categoria, limiteCentavos) {
  if (!Number.isInteger(limiteCentavos) || limiteCentavos <= 0) throw new Error('limite precisa ser positivo');
  repo.db.prepare(`insert into orcamentos (categoria, limite_centavos) values (?, ?)
    on conflict (categoria) do update set limite_centavos = excluded.limite_centavos`).run(categoria, limiteCentavos);
}

export function listarOrcamentos(repo) {
  return repo.db.prepare('select categoria, limite_centavos limiteCentavos from orcamentos order by categoria').all().map((r) => ({ ...r }));
}

/**
 * Avisos de 80% e 100% do mês, cada um no máximo uma vez por mês e categoria.
 * Passar direto de 100% dá só o aviso de 100 (o de 80 fica marcado junto).
 * @returns {{categoria: string, nivel: 80|100, gasto: number, limite: number}[]}
 */
export function avisosDeOrcamento(repo, mes, euId) {
  const gasto = gastoRealPorCategoria(repo, mes, euId);
  const avisos = [];
  const linhas = repo.db.prepare('select categoria, limite_centavos, aviso80_mes, aviso100_mes from orcamentos').all();
  for (const o of linhas) {
    const g = gasto.get(o.categoria) ?? 0;
    const limite = o.limite_centavos;
    if (g > limite && o.aviso100_mes !== mes) {
      avisos.push({ categoria: o.categoria, nivel: 100, gasto: g, limite });
      repo.db.prepare('update orcamentos set aviso100_mes = ?, aviso80_mes = ? where categoria = ?').run(mes, mes, o.categoria);
    } else if (g * 100 >= limite * 80 && g <= limite && o.aviso80_mes !== mes) {
      avisos.push({ categoria: o.categoria, nivel: 80, gasto: g, limite });
      repo.db.prepare('update orcamentos set aviso80_mes = ? where categoria = ?').run(mes, o.categoria);
    }
  }
  return avisos;
}

export function textoAvisoOrcamento({ categoria, nivel, gasto, limite }) {
  if (nivel === 100) return `Estourou o orçamento de ${categoria}: ${formatarReais(gasto)} de ${formatarReais(limite)}.`;
  return `Você já usou 80% do orçamento de ${categoria}: ${formatarReais(gasto)} de ${formatarReais(limite)}.`;
}
