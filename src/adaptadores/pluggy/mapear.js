// Toda a normalização da Pluggy para o formato interno mora aqui:
// sinal do valor (na Pluggy a compra de cartão é positiva) e campos de parcela.

const FATURA = /pag(?:to|amento|\.)?\s*(?:de\s+)?(?:da\s+)?fatura|pagamento recebido|pgto\s+fatura/i;
const PIX = /\bpix\b/i;
const TRANSFERENCIA = /\b(ted|doc)\b|transfer[êe]ncia/i;

const paraCentavos = (valor) => Math.round(Math.abs(valor) * 100);

function classificar(t, tipoConta, negativo) {
  const descricao = t.description ?? '';
  const operacao = String(t.operationType ?? '').toUpperCase();
  // operationType é o sinal estável; a descrição só entra como reserva.
  if (operacao === 'PAGAMENTO_FATURA' || FATURA.test(descricao)) return 'pagamento_fatura';
  if (tipoConta === 'cartao') return operacao === 'ESTORNO' || negativo ? 'estorno' : 'compra_cartao';
  if (operacao === 'PIX' || PIX.test(descricao)) return 'pix';
  if (['TED', 'DOC', 'TRANSFER', 'TRANSFERENCIA_MESMA_INSTITUICAO'].includes(operacao) || TRANSFERENCIA.test(descricao)) return 'transferencia';
  return 'debito';
}

/**
 * @param {object} transacao transação crua da Pluggy
 * @param {{idExterno: string, tipo: 'cartao'|'corrente'}} conta
 * @returns {import('../../portas/fonte.js').Movimentacao}
 */
export function mapearTransacao(transacao, conta) {
  const negativo = transacao.amount < 0;
  // Cartão: positivo é compra (saída). Conta corrente: negativo é saída.
  const saida = conta.tipo === 'cartao' ? !negativo : negativo;
  const mov = {
    idExterno: transacao.id,
    contaExternaId: conta.idExterno,
    direcao: saida ? 'saida' : 'entrada',
    tipo: classificar(transacao, conta.tipo, negativo),
    descricao: transacao.description ?? '',
    valorCentavos: paraCentavos(transacao.amount),
    data: String(transacao.date).slice(0, 10),
  };
  const parcelas = transacao.creditCardMetadata;
  if (parcelas?.totalInstallments > 1) {
    mov.parcelaAtual = parcelas.installmentNumber;
    mov.totalParcelas = parcelas.totalInstallments;
    if (parcelas.totalAmount != null) mov.valorTotalCentavos = paraCentavos(parcelas.totalAmount);
  }
  return mov;
}
