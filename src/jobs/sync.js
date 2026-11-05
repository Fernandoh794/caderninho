import { decidir } from '../nucleo/classificacao.js';
import { faturaRefDe } from '../nucleo/fatura.js';
import { normalizarEstabelecimento } from '../nucleo/estabelecimento.js';

const JANELA_PRIMEIRA_CARGA_DIAS = 365;
// Cobre um ciclo de fatura inteiro: bancos que só publicam a parcela no fechamento
// a datam no início do ciclo. Reprocessar é seguro, o id_externo é único.
const JANELA_SYNC_DIAS = 40;

function menosDias(dataISO, dias) {
  const d = new Date(`${dataISO}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - dias);
  return d.toISOString().slice(0, 10);
}

const ordemDeProcessamento = (a, b) =>
  a.data.localeCompare(b.data) || (a.parcelaAtual ?? 0) - (b.parcelaAtual ?? 0) || a.idExterno.localeCompare(b.idExterno);

/**
 * Busca movimentações novas e aplica a decisão do núcleo a cada uma.
 * @returns {Promise<{novas: number, pendentes: number}>}
 */
export async function sincronizar({ fonte, repo, hoje, nomesProprios = [] }) {
  const primeiraCarga = repo.obterEstado('ultimoSync') === null;
  const desde = menosDias(hoje, primeiraCarga ? JANELA_PRIMEIRA_CARGA_DIAS : JANELA_SYNC_DIAS);
  const mesCorrente = hoje.slice(0, 7);

  const contasExternas = await fonte.listarContas();
  const lotes = [];
  for (const externa of contasExternas) {
    const contaId = repo.upsertConta(externa);
    const conta = repo.listarContas().find((c) => c.id === contaId);
    const movs = await fonte.listarMovimentacoes(externa.idExterno, desde);
    lotes.push({ conta, movs });
  }

  let novas = 0;
  let pendentes = 0;
  repo.transacao(() => {
    for (const { conta, movs } of lotes) {
      const ehCartao = conta.tipo === 'cartao' && conta.diaFechamento;
      const faturaAberta = ehCartao ? faturaRefDe(hoje, conta.diaFechamento) : null;

      for (const bruta of [...movs].sort(ordemDeProcessamento)) {
        const mov = { ...bruta, estabelecimentoNorm: normalizarEstabelecimento(bruta.descricao) };
        const faturaRef = ehCartao ? faturaRefDe(mov.data, conta.diaFechamento) : null;

        const foraDaJanela = primeiraCarga && (ehCartao ? faturaRef < faturaAberta : mov.data.slice(0, 7) < mesCorrente);
        if (foraDaJanela) {
          if (repo.inserirMovimentacao(mov, { contaId: conta.id, status: 'ignorada', faturaRef }) != null) novas++;
          continue;
        }

        const decisao = decidir(mov, { memoria: repo.memoriaCategoria, grupos: repo.gruposParcelas(), nomesProprios });
        const r = aplicar(repo, mov, decisao, { contaId: conta.id, faturaRef });
        if (r.inserida) novas++;
        if (r.inserida && r.pendente) pendentes++;
      }
    }
    repo.definirEstado('ultimoSync', hoje);
  });
  return { novas, pendentes };
}

function aplicar(repo, mov, decisao, base) {
  const inserir = (m, extras) => repo.inserirMovimentacao(m, { ...base, ...extras });

  switch (decisao.acao) {
    case 'transferencia': {
      const tipo = mov.tipo === 'pagamento_fatura' ? 'pagamento_fatura' : 'transferencia';
      return { inserida: inserir({ ...mov, tipo }, { status: 'classificada' }) != null, pendente: false };
    }
    case 'categorizar':
      return { inserida: inserir(mov, { status: 'classificada', categoria: decisao.categoria }) != null, pendente: false };
    case 'herdar': {
      const primeira = repo.primeiraDoGrupo(decisao.grupoId);
      if (!primeira) return { inserida: inserir(mov, { status: 'pendente' }) != null, pendente: true };
      const id = inserir(mov, { status: 'classificada', categoria: primeira.categoria, grupoParcelasId: decisao.grupoId });
      if (id == null) return { inserida: false, pendente: false };
      const partes = repo.atribuicoesDe(primeira.id);
      if (partes.length) repo.gravarAtribuicoes(id, partes);
      return { inserida: true, pendente: false };
    }
    default:
      return { inserida: inserir(mov, { status: 'pendente' }) != null, pendente: true };
  }
}
