import makeWASocket, {
  DisconnectReason, downloadMediaMessage, fetchLatestBaileysVersion, useMultiFileAuthState,
} from '@whiskeysockets/baileys';
import qrcode from 'qrcode-terminal';
import { ehDoDono } from '../../whatsapp/filtro.js';

const ESPERA_RECONEXAO_MS = [1000, 5000, 15000, 60000];

/** Extrai o conteúdo útil; devolve null para o que o bot não trata. */
function extrair(msg) {
  const m = msg.message;
  if (!m) return null;
  const ctx = m.extendedTextMessage?.contextInfo ?? m.audioMessage?.contextInfo;
  const base = { id: msg.key.id, deJid: msg.key.remoteJid, respondeAId: ctx?.stanzaId ?? undefined };
  const texto = m.conversation ?? m.extendedTextMessage?.text;
  if (texto) return { ...base, texto };
  if (m.audioMessage) return { ...base, audioMime: m.audioMessage.mimetype ?? 'audio/ogg' };
  return null;
}

/**
 * Adaptador Baileys da porta Mensageiro. Atende só o dono; reconecta sozinho,
 * exceto em logout (aí é preciso parear de novo pelo QR via SSH).
 * @returns {import('../../portas/mensageiro.js').Mensageiro & {iniciar(): Promise<void>, parar(): void}}
 */
export function criarMensageiroBaileys({ authDir, dono, logger }) {
  const ouvintes = [];
  let sock = null;
  let tentativas = 0;
  let parado = false;

  async function conectar() {
    const { state, saveCreds } = await useMultiFileAuthState(authDir);
    const { version } = await fetchLatestBaileysVersion().catch(() => ({ version: undefined }));
    sock = makeWASocket({ auth: state, version, logger: logger.child({ modulo: 'baileys' }, { level: 'warn' }), markOnlineOnConnect: false });

    sock.ev.on('creds.update', saveCreds);
    sock.ev.on('connection.update', ({ connection, lastDisconnect, qr }) => {
      if (qr) {
        logger.info('pareamento: escaneie o QR abaixo no WhatsApp do bot');
        qrcode.generate(qr, { small: true });
      }
      if (connection === 'open') {
        tentativas = 0;
        logger.info('whatsapp conectado');
      }
      if (connection === 'close') {
        const codigo = lastDisconnect?.error?.output?.statusCode;
        if (codigo === DisconnectReason.loggedOut) {
          logger.error('whatsapp deslogado: apague a pasta de autenticação e pareie de novo');
          return;
        }
        if (parado) return;
        const espera = ESPERA_RECONEXAO_MS[Math.min(tentativas++, ESPERA_RECONEXAO_MS.length - 1)];
        logger.warn({ codigo, espera }, 'whatsapp caiu, reconectando');
        setTimeout(() => conectar().catch((e) => logger.error({ err: e }, 'falha ao reconectar')), espera);
      }
    });

    sock.ev.on('messages.upsert', async ({ messages, type }) => {
      if (type !== 'notify') return;
      for (const bruta of messages) {
        if (bruta.key.fromMe) continue;
        const jids = [bruta.key.remoteJid, bruta.key.remoteJidAlt].filter(Boolean);
        if (!jids.some((j) => ehDoDono(j, dono))) continue; // ignorado sem resposta
        const info = extrair(bruta);
        if (!info) continue;
        try {
          const msg = { id: info.id, deJid: info.deJid, texto: info.texto, respondeAId: info.respondeAId };
          if (info.audioMime) {
            const buffer = await downloadMediaMessage(bruta, 'buffer', {}, { logger, reuploadRequest: sock.updateMediaMessage });
            msg.audio = { buffer, mime: info.audioMime }; // conteúdo de áudio nunca vai para o log
          }
          for (const cb of ouvintes) await cb(msg);
        } catch (erro) {
          logger.error({ err: erro, id: info.id }, 'falha ao tratar mensagem');
        }
      }
    });
  }

  return {
    iniciar: conectar,
    parar() { parado = true; sock?.end(undefined); },
    aoReceber(cb) { ouvintes.push(cb); },
    async enviar(texto) {
      if (!sock) throw new Error('whatsapp não conectado');
      const r = await sock.sendMessage(dono.jid, { text: texto });
      return { id: r.key.id };
    },
  };
}
