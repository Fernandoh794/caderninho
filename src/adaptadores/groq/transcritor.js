import { ErroTranscricao } from '../../portas/transcritor.js';

const URL_GROQ = 'https://api.groq.com/openai/v1/audio/transcriptions';

const extensao = (mime) => {
  const base = (mime ?? '').split(';')[0].trim();
  return { 'audio/ogg': 'ogg', 'audio/mpeg': 'mp3', 'audio/mp4': 'm4a', 'audio/wav': 'wav', 'audio/webm': 'webm' }[base] ?? 'ogg';
};

/** Adaptador Groq (Whisper) da porta Transcritor. */
export function criarTranscritorGroq({ apiKey, fetch = globalThis.fetch, modelo = 'whisper-large-v3-turbo' }) {
  return {
    async transcrever(audio, mime) {
      const corpo = new FormData();
      corpo.append('file', new Blob([audio], { type: (mime ?? '').split(';')[0] || 'audio/ogg' }), `audio.${extensao(mime)}`);
      corpo.append('model', modelo);
      corpo.append('language', 'pt');
      corpo.append('response_format', 'json');

      let resposta;
      try {
        resposta = await fetch(URL_GROQ, { method: 'POST', headers: { Authorization: `Bearer ${apiKey}` }, body: corpo, signal: AbortSignal.timeout(60_000) });
      } catch (erro) {
        throw new ErroTranscricao('falha de rede ao transcrever', { cause: erro });
      }
      if (resposta.status !== 200) throw new ErroTranscricao(`groq respondeu HTTP ${resposta.status}`);
      const texto = (await resposta.json().catch(() => ({})))?.text?.trim();
      if (!texto) throw new ErroTranscricao('transcrição vazia');
      return texto;
    },
  };
}
