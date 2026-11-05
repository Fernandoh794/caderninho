/**
 * Porta FonteDeMovimentacoes: de onde vêm contas e movimentações.
 * A normalização (sinal, parcelas) é responsabilidade do adaptador.
 *
 * Contrato (executável em test/contratos/fonte.js; todo adaptador novo deve passar nele):
 * - valorCentavos inteiro e positivo; a direção carrega o sinal; data AAAA-MM-DD;
 *   idExterno único; listarMovimentacoes só devolve data >= desde.
 * - Falhas tipadas: excesso de chamadas lança ErroLimite; consentimento vencido ou
 *   revogado lança ErroAutorizacao. O monitor de saúde e o sync dependem desses tipos.
 * - Parcelas: parcelaAtual e totalParcelas quando a origem informa; valorTotalCentavos
 *   é opcional (o Open Finance costuma omitir) e o núcleo não pode exigi-lo.
 *
 * @typedef {{idExterno: string, tipo: 'cartao'|'corrente', banco: string, apelido: string,
 *   diaFechamento?: number, diaVencimento?: number}} ContaExterna
 *
 * @typedef {'compra_cartao'|'pix'|'debito'|'transferencia'|'pagamento_fatura'|'estorno'} TipoMovimentacao
 *
 * @typedef {{idExterno: string, contaExternaId: string, direcao: 'entrada'|'saida',
 *   tipo: TipoMovimentacao, descricao: string,
 *   valorCentavos: number,  // sempre positivo
 *   data: string,           // AAAA-MM-DD
 *   parcelaAtual?: number, totalParcelas?: number, valorTotalCentavos?: number}} Movimentacao
 *
 * @typedef {{
 *   listarContas(): Promise<ContaExterna[]>,
 *   listarMovimentacoes(contaExternaId: string, desde: string): Promise<Movimentacao[]>
 * }} FonteDeMovimentacoes
 */

/** A fonte atingiu o limite de chamadas; tentar de novo mais tarde. */
export class ErroLimite extends Error {
  constructor(mensagem = 'limite de chamadas atingido', opcoes) {
    super(mensagem, opcoes);
    this.name = 'ErroLimite';
  }
}

/** A autorização (consentimento Open Finance) não vale mais. */
export class ErroAutorizacao extends Error {
  constructor(mensagem = 'autorização expirada ou revogada', opcoes) {
    super(mensagem, opcoes);
    this.name = 'ErroAutorizacao';
  }
}
