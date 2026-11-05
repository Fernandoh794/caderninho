import { test } from 'node:test';
import assert from 'node:assert/strict';
import { montarBot, DONO } from './apoio.js';
import { criarTranscritorFalso } from '../../src/falsos/transcritor.js';
import { ErroTranscricao } from '../../src/portas/transcritor.js';

test('áudio "mãe mercado" grava como texto', async () => {
  const transcritor = criarTranscritorFalso({ texto: 'mãe mercado' });
  const { bot, mov, mensageiro, idDaPergunta, repo, mae } = montarBot({ transcritor });
  const a = mov();
  await bot.perguntarPendentes();
  await mensageiro.simular({ id: 'x', deJid: DONO, audio: { buffer: Buffer.from('ogg'), mime: 'audio/ogg' }, respondeAId: idDaPergunta(a) });
  assert.equal(repo.obterMovimentacao(a).status, 'classificada');
  assert.deepEqual(repo.atribuicoesDe(a), [{ pessoaId: mae, bp: 10000 }]);
  assert.equal(transcritor.chamadas.length, 1);
});

test('falha da transcrição não grava e pede texto', async () => {
  const transcritor = criarTranscritorFalso({ erro: new ErroTranscricao() });
  const { bot, mov, mensageiro, idDaPergunta, repo } = montarBot({ transcritor });
  const a = mov();
  await bot.perguntarPendentes();
  await mensageiro.simular({ id: 'x', deJid: DONO, audio: { buffer: Buffer.from('ogg'), mime: 'audio/ogg' }, respondeAId: idDaPergunta(a) });
  assert.equal(repo.obterMovimentacao(a).status, 'pendente');
  assert.ok(repo.perguntaAberta(a));
  assert.equal(mensageiro.ultima(), 'Não consegui ouvir o áudio, manda por texto.');
});
