import { interpretarResposta } from './interpretacao/parser.js';
import { formatarReais } from './nucleo/dinheiro.js';
import { ErroTranscricao } from './portas/transcritor.js';

export const MAX_PERGUNTAS_ABERTAS = 5;

const EXEMPLOS = 'Exemplos: "mãe mercado", "irmã 50% lazer", "mãe 30, eu 70 compras", "mercado", "renda", "reembolso".';

const ehCartao = (mov) => mov.contaTipo === 'cartao';
const precisaDono = (mov) => ehCartao(mov) && (mov.direcao === 'saida' || mov.tipo === 'estorno');
const ehEntradaComum = (mov) => mov.direcao === 'entrada' && mov.tipo !== 'estorno';

/**
 * Conversa com o dono: faz as perguntas pendentes e grava as respostas.
 * Toda gravação passa pelo parser rígido; o que vem da IA ou sem citação
 * é confirmado antes.
 */
export function criarBot({ repo, mensageiro, transcritor, interpretador, agora, comandos, aposGravar, logger }) {
  /** @type {{movId: number, resultado: object} | null} */
  let aguardando = null;

  const pessoas = () => repo.listarPessoas();
  const nomeDe = (id) => pessoas().find((p) => p.id === id)?.nome ?? '?';
  const descreverPartes = (partes) => partes
    .slice().sort((a, b) => b.bp - a.bp)
    .map((p) => (p.bp === 10000 ? nomeDe(p.pessoaId) : `${nomeDe(p.pessoaId)} ${p.bp / 100}%`))
    .join(', ');
  const resumoMov = (mov) => `${mov.descricao}, ${formatarReais(mov.valorCentavos)}`;

  function sugestao(mov) {
    if (!precisaDono(mov)) return null;
    const partes = repo.ultimoDono(mov.estabelecimentoNorm);
    const categoria = repo.memoriaCategoria(mov.estabelecimentoNorm);
    return partes && categoria ? { tipo: 'atribuicao', partes, categoria } : null;
  }

  function textoPergunta(mov) {
    const parcela = mov.totalParcelas ? ` (parcela ${mov.parcelaAtual}/${mov.totalParcelas})` : '';
    if (mov.tipo === 'estorno') {
      return `Estorno de ${formatarReais(mov.valorCentavos)}: ${mov.descricao} no ${mov.contaApelido}. De quem era e qual categoria?`;
    }
    if (ehEntradaComum(mov)) {
      return `Entrou ${formatarReais(mov.valorCentavos)}: ${mov.descricao} (${mov.contaApelido}). Renda ou reembolso?`;
    }
    if (!ehCartao(mov)) return `${resumoMov(mov)} (${mov.contaApelido}). Qual categoria?`;
    let texto = `${resumoMov(mov)} no ${mov.contaApelido}${parcela}. De quem é e qual categoria?`;
    const s = sugestao(mov);
    if (s) texto += `\nÚltima vez foi da ${descreverPartes(s.partes)}, ${s.categoria}. Mesma coisa? sim/não`;
    return texto;
  }

  async function perguntarPendentes() {
    const abertas = repo.perguntasAbertas().length;
    const vagas = MAX_PERGUNTAS_ABERTAS - abertas;
    if (vagas <= 0) return;
    const novas = repo.listarPendentes().filter((m) => !repo.perguntaAberta(m.id)).slice(0, vagas);
    for (const mov of novas) {
      const { id } = await mensageiro.enviar(textoPergunta(mov));
      repo.registrarPergunta(mov.id, id);
    }
  }

  /** @returns {{movId: number, exato: boolean} | null} */
  function resolverAlvo(msg) {
    if (msg.respondeAId) {
      const movId = repo.perguntaPorMensagem(msg.respondeAId);
      if (movId != null) return { movId, exato: true };
    }
    const maisRecente = repo.perguntasAbertas()[0];
    return maisRecente ? { movId: maisRecente.movId, exato: false } : null;
  }

  /**
   * Converte o resultado do parser em alterações para a movimentação.
   * @returns {{ok: true, partes?: object[], categoria?: string, completa: boolean} | {ok: false, motivo: string}}
   */
  function planejar(mov, r) {
    const atuais = repo.atribuicoesDe(mov.id);
    if (ehEntradaComum(mov)) {
      if (r.tipo === 'entrada') return { ok: true, categoria: r.classe, completa: true };
      return { ok: false, motivo: 'Essa é uma entrada: responda "renda" ou "reembolso".' };
    }
    if (r.tipo === 'entrada') return { ok: false, motivo: `"${r.classe}" só vale para entradas. ${EXEMPLOS}` };

    const categoria = r.categoria ?? (r.tipo === 'atribuicao' ? repo.memoriaCategoria(mov.estabelecimentoNorm) : null) ?? mov.categoria ?? undefined;
    if (!precisaDono(mov)) {
      if (!categoria) return { ok: false, motivo: `Aqui só preciso da categoria. ${EXEMPLOS}` };
      return { ok: true, categoria, completa: true };
    }
    const partes = r.tipo === 'atribuicao' ? r.partes : undefined;
    const temDono = !!partes || atuais.length > 0;
    return { ok: true, partes, categoria, completa: temDono && !!categoria };
  }

  function descreverPlano(mov, plano) {
    const quem = plano.partes ? descreverPartes(plano.partes) : (repo.atribuicoesDe(mov.id).length ? descreverPartes(repo.atribuicoesDe(mov.id)) : null);
    return [quem, plano.categoria].filter(Boolean).join(' · ') || '—';
  }

  async function gravar(mov, plano) {
    repo.transacao(() => {
      if (plano.partes) repo.gravarAtribuicoes(mov.id, plano.partes);
      if (plano.categoria) {
        repo.definirCategoria(mov.id, plano.categoria);
        if (!ehEntradaComum(mov)) repo.salvarMemoria(mov.estabelecimentoNorm, plano.categoria);
      }
      if (plano.completa) {
        repo.marcarClassificada(mov.id);
        repo.fecharPergunta(mov.id);
        if (mov.parcelaAtual === 1 && mov.totalParcelas > 1 && !mov.grupoParcelasId) {
          // Sem valor total (Open Finance), estima pela parcela; ver acharGrupoParcelas.
          const valorTotalCentavos = mov.valorTotalCentavos ?? mov.valorCentavos * mov.totalParcelas;
          const g = repo.abrirGrupo({ contaId: mov.contaId, estabelecimentoNorm: mov.estabelecimentoNorm,
            valorTotalCentavos, totalParcelas: mov.totalParcelas });
          repo.vincularGrupo(mov.id, g);
        }
      }
    });
    if (!plano.completa) {
      const falta = plano.categoria ? 'De quem é?' : 'E a categoria?';
      await mensageiro.enviar(`Anotado: ${mov.descricao} → ${descreverPlano(mov, plano)}. ${falta}`);
      return;
    }
    await mensageiro.enviar(`✓ ${mov.descricao} → ${descreverPlano(mov, plano)}`);
    if (aposGravar) await aposGravar(repo.obterMovimentacao(mov.id));
    await perguntarPendentes();
  }

  async function pedirConfirmacao(mov, resultado, plano) {
    aguardando = { movId: mov.id, resultado };
    await mensageiro.enviar(`${resumoMov(mov)} → ${descreverPlano(mov, plano)}. Confirma? sim/não`);
  }

  async function obterTexto(msg) {
    if (msg.texto != null) return msg.texto;
    if (!msg.audio) return null;
    try {
      return await transcritor.transcrever(msg.audio.buffer, msg.audio.mime);
    } catch (erro) {
      logger?.warn({ err: erro instanceof ErroTranscricao ? erro.message : erro }, 'falha na transcrição');
      await mensageiro.enviar('Não consegui ouvir o áudio, manda por texto.');
      return null;
    }
  }

  async function aoReceber(msg) {
    const texto = await obterTexto(msg);
    if (texto == null) return;
    let r = interpretarResposta(texto, { pessoas: pessoas(), categorias: repo.listarCategorias() });

    if (r.tipo === 'comando') {
      const resposta = comandos ? await comandos(r.nome, r.args) : 'Comandos ainda não disponíveis.';
      await mensageiro.enviar(resposta);
      return;
    }

    // Resposta a um "Confirma?" pendente — só quando não cita outra pergunta
    const citada = msg.respondeAId ? repo.perguntaPorMensagem(msg.respondeAId) : null;
    if (aguardando && r.tipo === 'confirmacao' && (citada == null || citada === aguardando.movId)) {
      const { movId, resultado } = aguardando;
      aguardando = null;
      const mov = repo.obterMovimentacao(movId);
      if (!mov || mov.status !== 'pendente') return;
      if (!r.valor) {
        await mensageiro.enviar(`Ok, descartei. ${textoPergunta(mov)}`);
        return;
      }
      await gravar(mov, planejar(mov, resultado));
      return;
    }
    aguardando = null;

    const alvo = resolverAlvo(msg);
    if (!alvo) {
      await mensageiro.enviar('Nada pendente agora. Comandos: !pendentes, !fatura, !gastos, !contas.');
      return;
    }
    const mov = repo.obterMovimentacao(alvo.movId);
    let precisaConfirmar = !alvo.exato;

    if (r.tipo === 'confirmacao') {
      const s = r.valor ? sugestao(mov) : null;
      if (!s) {
        await mensageiro.enviar(r.valor ? `Não tenho sugestão para essa. ${textoPergunta(mov)}` : `Então me diga: ${textoPergunta(mov)}`);
        return;
      }
      r = s;
    }

    if (r.tipo === 'invalido' && r.motivo === 'soma') {
      await mensageiro.enviar(`Os percentuais precisam fechar 100%. ${EXEMPLOS}`);
      return;
    }
    if (r.tipo === 'invalido') {
      r = await interpretarComIA(texto, mov);
      if (!r) {
        await mensageiro.enviar(`Não entendi. ${EXEMPLOS}`);
        return;
      }
      precisaConfirmar = true;
    }

    const plano = planejar(mov, r);
    if (!plano.ok) {
      await mensageiro.enviar(plano.motivo);
      return;
    }
    if (precisaConfirmar) {
      await pedirConfirmacao(mov, r, plano);
      return;
    }
    await gravar(mov, plano);
  }

  async function interpretarComIA(texto, mov) {
    if (!interpretador) return null;
    try {
      const r = await interpretador.interpretar(texto, {
        estabelecimento: mov.descricao, pessoas: pessoas(), categorias: repo.listarCategorias(),
      });
      if (!r || r.tipo === 'invalido' || r.tipo === 'comando' || r.tipo === 'confirmacao') return null;
      return r;
    } catch (erro) {
      logger?.warn({ err: erro }, 'falha no interpretador');
      return null;
    }
  }

  mensageiro.aoReceber((msg) => aoReceber(msg));
  return { perguntarPendentes, aoReceber, textoPergunta, resolverAlvo };
}
