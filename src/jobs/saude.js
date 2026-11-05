import { ErroAutorizacao } from '../portas/fonte.js';

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

/** Executa `fn` até `tentativas` vezes, dobrando a espera entre elas. */
export async function comEspera(fn, { tentativas = 3, baseMs = 1000, esperar = dormir } = {}) {
  let ultimoErro;
  for (let i = 0; i < tentativas; i++) {
    try {
      return await fn();
    } catch (erro) {
      ultimoErro = erro;
      if (erro instanceof ErroAutorizacao) break; // esperar não resolve autorização vencida
      if (i < tentativas - 1) await esperar(baseMs * 2 ** i);
    }
  }
  throw ultimoErro;
}

export const FALHAS_PARA_AVISAR = 3;

/** Conta falhas seguidas do sync e avisa uma única vez na 3ª; um sucesso rearma. */
export function criarMonitorSync({ aviso }) {
  let seguidas = 0;
  let avisou = false;
  return {
    sucesso() { seguidas = 0; avisou = false; },
    async falha(erro) {
      seguidas++;
      if (erro instanceof ErroAutorizacao && !avisou) {
        avisou = true;
        await aviso('A Pluggy recusou a autorização dos bancos. Renove o consentimento no Meu Pluggy para eu voltar a ler as movimentações.');
        return;
      }
      if (seguidas >= FALHAS_PARA_AVISAR && !avisou) {
        avisou = true;
        await aviso(`Não consigo buscar as movimentações há ${seguidas} tentativas seguidas. Continuo tentando nos próximos ciclos.`);
      }
    },
  };
}

const diasEntre = (de, ate) => Math.round((Date.parse(`${ate}T00:00:00Z`) - Date.parse(`${de}T00:00:00Z`)) / 86_400_000);

/** Texto quando faltam 30 dias ou menos para o consentimento vencer (ou já venceu). */
export function avisoConsentimento(venceEm, hoje) {
  if (!venceEm) return null;
  const faltam = diasEntre(hoje, venceEm);
  if (faltam > 30) return null;
  if (faltam < 0) return 'O consentimento do Open Finance venceu. Renove no Meu Pluggy para eu voltar a ler os bancos.';
  if (faltam === 0) return 'O consentimento do Open Finance vence hoje. Renove no Meu Pluggy.';
  return `O consentimento do Open Finance vence em ${faltam} dias (${venceEm.slice(8, 10)}/${venceEm.slice(5, 7)}). Renove no Meu Pluggy.`;
}

export function textoPendencias(quantidade) {
  if (!quantidade) return null;
  const s = quantidade === 1 ? '1 movimentação esperando' : `${quantidade} movimentações esperando`;
  return `Você tem ${s} dono ou categoria. Mande !pendentes para ver.`;
}
