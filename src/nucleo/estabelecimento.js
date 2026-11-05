const PREFIXOS_CANAL = /^(?:(?:pix|compra|cartao|debito|pagamento|pgto|transf(?:erencia)?|enviado|recebido)\b\s*)+/;
const PREFIXO_ADQUIRENTE = /^[a-z0-9]{1,8}\s*\*\s*/; // mp*, pag*, ifd*, sumup*
const PARCELA = /\b(?:parc(?:ela)?\s*)?\d{1,2}\s*\/\s*\d{1,2}\b/g;
const SUFIXOS = /(?:\s+(?:ltda|s\s*a|sa|me|eireli|epp|mei))+$/;

/**
 * Chave estável de um estabelecimento: minúsculas, sem acentos, sem prefixos
 * de canal/adquirente, sem número de parcela e sem sufixo societário.
 * @param {string} descricao
 * @returns {string}
 */
export function normalizarEstabelecimento(descricao) {
  if (!descricao) return '';
  let s = descricao
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(PARCELA, ' ')
    .replace(/[^a-z0-9.*&\-\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  s = s.replace(PREFIXOS_CANAL, '').replace(PREFIXO_ADQUIRENTE, '');
  // "S.A." vira "s.a." — trata os pontos antes do corte de sufixo
  s = s.replace(/\bs\.a\.?$/, 'sa').replace(/\.$/, '');
  s = s.replace(SUFIXOS, '');
  return s.replace(/\s+/g, ' ').trim();
}
