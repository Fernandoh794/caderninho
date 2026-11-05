/**
 * Porta Transcritor: áudio → texto.
 * @typedef {{transcrever(audio: Buffer, mime: string): Promise<string>}} Transcritor
 */

/** Não foi possível transcrever (serviço fora, resposta vazia). */
export class ErroTranscricao extends Error {
  constructor(mensagem = 'falha na transcrição', opcoes) {
    super(mensagem, opcoes);
    this.name = 'ErroTranscricao';
  }
}
