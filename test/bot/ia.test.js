import { test } from 'node:test';
import assert from 'node:assert/strict';
import { montarBot } from './apoio.js';
import { criarInterpretadorFalso } from '../../src/falsos/interpretador.js';

test('parser falha, IA devolve mãe 100%: pede Confirma? e só grava no sim', async () => {
  const { bot, mov, responder, idDaPergunta, repo, mensageiro, mae, interpretador } = montarBot({
    interpretador: criarInterpretadorFalso({ resultado: { tipo: 'atribuicao', partes: [], categoria: 'assinaturas' } }),
  });
  interpretador.resultado.partes = [{ pessoaId: mae, bp: 10000 }];
  const a = mov({ descricao: 'Netflix' });
  await bot.perguntarPendentes();
  await responder('foi da minha mãe, é assinatura', idDaPergunta(a));
  assert.match(mensageiro.ultima(), /Netflix.*mãe · assinaturas\. Confirma\?/);
  assert.equal(repo.obterMovimentacao(a).status, 'pendente');
  assert.deepEqual(interpretador.chamadas[0].contexto.estabelecimento, 'Netflix');
  await responder('sim');
  assert.equal(repo.obterMovimentacao(a).status, 'classificada');
  assert.deepEqual(repo.atribuicoesDe(a), [{ pessoaId: mae, bp: 10000 }]);
});

test('IA também não entende: nada gravado e mostra exemplos', async () => {
  const { bot, mov, responder, idDaPergunta, repo, mensageiro } = montarBot();
  const a = mov();
  await bot.perguntarPendentes();
  await responder('blá blá', idDaPergunta(a));
  assert.equal(repo.obterMovimentacao(a).status, 'pendente');
  assert.match(mensageiro.ultima(), /Não entendi\. Exemplos/);
});
