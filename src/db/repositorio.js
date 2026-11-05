import { normalizarEstabelecimento } from '../nucleo/estabelecimento.js';

const MOV_SELECT = `
  select m.id, m.id_externo idExterno, m.conta_id contaId, c.id_externo contaExternaId,
    c.apelido contaApelido, c.tipo contaTipo, m.direcao, m.tipo, m.descricao,
    m.estabelecimento_norm estabelecimentoNorm, m.valor_centavos valorCentavos, m.data,
    m.categoria, m.parcela_atual parcelaAtual, m.total_parcelas totalParcelas,
    m.valor_total_centavos valorTotalCentavos, m.grupo_parcelas_id grupoParcelasId,
    m.fatura_ref faturaRef, m.status
  from movimentacoes m join contas c on c.id = m.conta_id`;

const limpar = (linha) => (linha ? { ...linha } : null);

/** Acesso a dados. Nenhuma regra de negócio mora aqui. */
export function criarRepositorio(db) {
  const transacao = (fn) => {
    db.exec('savepoint repo');
    try {
      const r = fn();
      db.exec('release repo');
      return r;
    } catch (e) {
      db.exec('rollback to repo');
      db.exec('release repo');
      throw e;
    }
  };

  const repo = {
    db,
    transacao,

    // ---- pessoas, categorias, contas
    criarPessoa({ nome, apelidos = [], ehEu = false }) {
      return Number(db.prepare('insert into pessoas (nome, apelidos, eh_eu) values (?, ?, ?)')
        .run(nome, JSON.stringify(apelidos), ehEu ? 1 : 0).lastInsertRowid);
    },
    listarPessoas() {
      return db.prepare('select id, nome, apelidos, eh_eu from pessoas order by id').all()
        .map((p) => ({ id: p.id, nome: p.nome, apelidos: JSON.parse(p.apelidos), ehEu: p.eh_eu === 1 }));
    },
    pessoaEu() {
      return repo.listarPessoas().find((p) => p.ehEu) ?? null;
    },
    listarCategorias() {
      return db.prepare('select nome from categorias order by rowid').all().map((r) => r.nome);
    },
    criarCategoria(nome) {
      db.prepare('insert or ignore into categorias (nome) values (?)').run(nome);
    },
    upsertConta({ idExterno, tipo, banco, apelido, diaFechamento = null, diaVencimento = null }) {
      db.prepare(`insert into contas (id_externo, tipo, banco, apelido, dia_fechamento, dia_vencimento)
        values (?, ?, ?, ?, ?, ?)
        on conflict (id_externo) do update set tipo = excluded.tipo, banco = excluded.banco,
          dia_fechamento = coalesce(excluded.dia_fechamento, contas.dia_fechamento),
          dia_vencimento = coalesce(excluded.dia_vencimento, contas.dia_vencimento)`)
        .run(idExterno, tipo, banco, apelido, diaFechamento, diaVencimento);
      return db.prepare('select id from contas where id_externo = ?').get(idExterno).id;
    },
    listarContas() {
      return db.prepare(`select id, id_externo idExterno, tipo, banco, apelido,
        dia_fechamento diaFechamento, dia_vencimento diaVencimento from contas order by id`).all().map(limpar);
    },

    // ---- movimentações
    inserirMovimentacao(mov, { contaId, status, categoria = null, faturaRef = null, grupoParcelasId = null }) {
      const r = db.prepare(`insert or ignore into movimentacoes
        (id_externo, conta_id, direcao, tipo, descricao, estabelecimento_norm, valor_centavos, data,
         categoria, parcela_atual, total_parcelas, valor_total_centavos, grupo_parcelas_id, fatura_ref, status)
        values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
        mov.idExterno, contaId, mov.direcao, mov.tipo, mov.descricao,
        mov.estabelecimentoNorm ?? normalizarEstabelecimento(mov.descricao), mov.valorCentavos, mov.data,
        categoria, mov.parcelaAtual ?? null, mov.totalParcelas ?? null, mov.valorTotalCentavos ?? null,
        grupoParcelasId, faturaRef, status);
      return r.changes === 0 ? null : Number(r.lastInsertRowid);
    },
    obterMovimentacao(id) {
      return limpar(db.prepare(`${MOV_SELECT} where m.id = ?`).get(id));
    },
    listarPendentes() {
      return db.prepare(`${MOV_SELECT} where m.status = 'pendente' order by m.data, m.id`).all().map(limpar);
    },
    listarMovimentacoes({ contaId, faturaRef, mesDe } = {}) {
      const cond = [];
      const args = [];
      if (contaId != null) { cond.push('m.conta_id = ?'); args.push(contaId); }
      if (faturaRef != null) { cond.push('m.fatura_ref = ?'); args.push(faturaRef); }
      if (mesDe != null) { cond.push("substr(m.data, 1, 7) = ?"); args.push(mesDe); }
      const where = cond.length ? `where ${cond.join(' and ')}` : '';
      return db.prepare(`${MOV_SELECT} ${where} order by m.data, m.id`).all(...args).map(limpar);
    },
    gravarAtribuicoes(movId, partes) {
      const soma = partes.reduce((s, p) => s + p.bp, 0);
      if (soma !== 10000) throw new Error(`atribuições devem somar 10000 bp, vieram ${soma}`);
      transacao(() => {
        db.prepare('delete from atribuicoes where movimentacao_id = ?').run(movId);
        const ins = db.prepare('insert into atribuicoes (movimentacao_id, pessoa_id, bp) values (?, ?, ?)');
        for (const p of partes) ins.run(movId, p.pessoaId, p.bp);
      });
    },
    atribuicoesDe(movId) {
      return db.prepare('select pessoa_id pessoaId, bp from atribuicoes where movimentacao_id = ? order by pessoa_id')
        .all(movId).map(limpar);
    },
    definirCategoria(movId, categoria) {
      db.prepare('update movimentacoes set categoria = ? where id = ?').run(categoria, movId);
    },
    marcarClassificada(movId) {
      db.prepare("update movimentacoes set status = 'classificada' where id = ?").run(movId);
    },
    marcarIgnorada(movId) {
      db.prepare("update movimentacoes set status = 'ignorada' where id = ?").run(movId);
    },

    // ---- memória
    memoriaCategoria(estabNorm) {
      return db.prepare('select categoria from memoria_estabelecimento where estabelecimento_norm = ?').get(estabNorm)?.categoria ?? null;
    },
    salvarMemoria(estabNorm, categoria) {
      if (!estabNorm) return;
      db.prepare(`insert into memoria_estabelecimento (estabelecimento_norm, categoria) values (?, ?)
        on conflict (estabelecimento_norm) do update set categoria = excluded.categoria`).run(estabNorm, categoria);
    },
    ultimoDono(estabNorm) {
      const ultima = db.prepare(`select m.id from movimentacoes m
        where m.estabelecimento_norm = ? and exists (select 1 from atribuicoes a where a.movimentacao_id = m.id)
        order by m.data desc, m.id desc limit 1`).get(estabNorm);
      return ultima ? repo.atribuicoesDe(ultima.id) : null;
    },

    // ---- parcelas
    gruposParcelas() {
      return db.prepare(`select g.id, g.conta_id contaId, g.estabelecimento_norm estabelecimentoNorm,
          g.valor_total_centavos valorTotalCentavos, g.total_parcelas totalParcelas,
          coalesce(max(m.parcela_atual), 0) ultimaParcela
        from grupos_parcelas g left join movimentacoes m on m.grupo_parcelas_id = g.id
        group by g.id order by g.id`).all().map(limpar);
    },
    abrirGrupo({ contaId, estabelecimentoNorm, valorTotalCentavos, totalParcelas }) {
      return Number(db.prepare(`insert into grupos_parcelas (conta_id, estabelecimento_norm, valor_total_centavos, total_parcelas)
        values (?, ?, ?, ?)`).run(contaId, estabelecimentoNorm, valorTotalCentavos, totalParcelas).lastInsertRowid);
    },
    vincularGrupo(movId, grupoId) {
      db.prepare('update movimentacoes set grupo_parcelas_id = ? where id = ?').run(grupoId, movId);
    },
    primeiraDoGrupo(grupoId) {
      return limpar(db.prepare(`${MOV_SELECT} where m.grupo_parcelas_id = ? and m.status = 'classificada'
        order by m.parcela_atual limit 1`).get(grupoId));
    },

    // ---- perguntas
    registrarPergunta(movId, mensagemId) {
      db.prepare(`insert into perguntas (movimentacao_id, mensagem_id, aberta) values (?, ?, 1)
        on conflict (movimentacao_id) do update set mensagem_id = excluded.mensagem_id, aberta = 1`).run(movId, mensagemId);
    },
    perguntaPorMensagem(mensagemId) {
      return db.prepare('select movimentacao_id movId from perguntas where mensagem_id = ? and aberta = 1').get(mensagemId)?.movId ?? null;
    },
    perguntasAbertas() {
      return db.prepare('select movimentacao_id movId, mensagem_id mensagemId from perguntas where aberta = 1 order by id desc')
        .all().map(limpar);
    },
    perguntaAberta(movId) {
      return !!db.prepare('select 1 from perguntas where movimentacao_id = ? and aberta = 1').get(movId);
    },
    fecharPergunta(movId) {
      db.prepare('update perguntas set aberta = 0 where movimentacao_id = ?').run(movId);
    },

    // ---- estado
    obterEstado(chave) {
      return db.prepare('select valor from estado where chave = ?').get(chave)?.valor ?? null;
    },
    definirEstado(chave, valor) {
      db.prepare(`insert into estado (chave, valor) values (?, ?)
        on conflict (chave) do update set valor = excluded.valor`).run(chave, valor);
    },
  };
  return repo;
}
