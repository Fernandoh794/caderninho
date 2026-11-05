/**
 * Porta Mensageiro: recebe e envia mensagens da conversa privada com o dono.
 *
 * @typedef {{id: string, deJid: string, texto?: string,
 *   audio?: {buffer: Buffer, mime: string}, respondeAId?: string}} MensagemRecebida
 *
 * @typedef {{
 *   aoReceber(cb: (msg: MensagemRecebida) => void): void,
 *   enviar(texto: string): Promise<{id: string}>
 * }} Mensageiro
 */
export {};
