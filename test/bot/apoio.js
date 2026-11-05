import { abrirBanco } from '../../src/db/abrir.js';
import { criarRepositorio } from '../../src/db/repositorio.js';
import { criarMensageiroFalso } from '../../src/falsos/mensageiro.js';
import { criarTranscritorFalso } from '../../src/falsos/transcritor.js';
import { criarInterpretadorFalso } from '../../src/falsos/interpretador.js';
import { criarBot } from '../../src/bot.js';

export const DONO = '5579999990000@s.whatsapp.net';

/** Monta banco, pessoas, um cartão e uma conta, e o bot com falsos. */
export function montarBot(opcoes = {}) {
  const repo = criarRepositorio(abrirBanco());
  const eu = repo.criarPessoa({ nome: 'eu', ehEu: true });
  const mae = repo.criarPessoa({ nome: 'mãe', apelidos: ['mamãe'] });
  const irma = repo.criarPessoa({ nome: 'irmã', apelidos: ['mana'] });
  const cartao = repo.upsertConta({ idExterno: 'cc', tipo: 'cartao', banco: 'bb', apelido: 'BB', diaFechamento: 15, diaVencimento: 25 });
  const conta = repo.upsertConta({ idExterno: 'cr', tipo: 'corrente', banco: 'inter', apelido: 'Inter' });
  const mensageiro = criarMensageiroFalso();
  const transcritor = opcoes.transcritor ?? criarTranscritorFalso();
  const interpretador = opcoes.interpretador ?? criarInterpretadorFalso();
  const bot = criarBot({ repo, mensageiro, transcritor, interpretador, agora: () => '2026-11-04', ...opcoes.extra });
  let seq = 0;
  const mov = (extra = {}) => {
    const contaId = extra.contaId ?? cartao;
    const ehCartao = contaId === cartao;
    const m = { idExterno: `t${++seq}`, direcao: 'saida', tipo: ehCartao ? 'compra_cartao' : 'pix',
      descricao: `Loja ${seq}`, valorCentavos: 5590, data: '2026-11-01', ...extra };
    return repo.inserirMovimentacao(m, { contaId, status: 'pendente', faturaRef: ehCartao ? '2026-11' : null });
  };
  let msgSeq = 0;
  const responder = (texto, respondeAId) => mensageiro.simular({ id: `in-${++msgSeq}`, deJid: DONO, texto, respondeAId });
  const idDaPergunta = (movId) => repo.perguntasAbertas().find((p) => p.movId === movId)?.mensagemId;
  return { repo, mensageiro, transcritor, interpretador, bot, eu, mae, irma, cartao, conta, mov, responder, idDaPergunta };
}
