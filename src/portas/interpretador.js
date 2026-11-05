/**
 * Porta Interpretador: texto livre → Resultado (mesmo formato do parser rígido).
 * Todo resultado vindo daqui tem `precisaConfirmar: true`.
 *
 * @typedef {import('../interpretacao/parser.js').Resultado} Resultado
 * @typedef {{
 *   interpretar(texto: string, contexto: {estabelecimento?: string, pessoas: object[], categorias: string[]}): Promise<Resultado>,
 *   sugerirCategoria(estabelecimento: string, categorias: string[]): Promise<string|null>
 * }} Interpretador
 */
export {};
