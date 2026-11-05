-- Dinheiro em centavos (INTEGER), percentuais em pontos-base (10000 = 100%), datas ISO (TEXT).

create table pessoas (
  id integer primary key,
  nome text not null unique,
  apelidos text not null default '[]',          -- JSON: ["mamãe", "mae"]
  eh_eu integer not null default 0 check (eh_eu in (0, 1))
);
create unique index pessoas_um_so_eu on pessoas (eh_eu) where eh_eu = 1;

create table contas (
  id integer primary key,
  tipo text not null check (tipo in ('cartao', 'corrente')),
  banco text not null,
  apelido text not null,
  id_externo text not null unique,
  dia_fechamento integer check (dia_fechamento between 1 and 31),
  dia_vencimento integer check (dia_vencimento between 1 and 31)
);

create table grupos_parcelas (
  id integer primary key,
  conta_id integer not null references contas (id),
  estabelecimento_norm text not null,
  valor_total_centavos integer not null,
  total_parcelas integer not null
);

create table movimentacoes (
  id integer primary key,
  id_externo text not null unique,
  conta_id integer not null references contas (id),
  direcao text not null check (direcao in ('entrada', 'saida')),
  tipo text not null check (tipo in ('compra_cartao', 'pix', 'debito', 'transferencia', 'pagamento_fatura', 'estorno')),
  descricao text not null,
  estabelecimento_norm text not null,
  valor_centavos integer not null check (valor_centavos > 0),
  data text not null,
  categoria text,
  parcela_atual integer,
  total_parcelas integer,
  valor_total_centavos integer,
  grupo_parcelas_id integer references grupos_parcelas (id),
  fatura_ref text,
  status text not null check (status in ('pendente', 'classificada', 'ignorada'))
);
create index movimentacoes_status on movimentacoes (status);
create index movimentacoes_fatura on movimentacoes (conta_id, fatura_ref);
create index movimentacoes_estab on movimentacoes (estabelecimento_norm);

create table atribuicoes (
  movimentacao_id integer not null references movimentacoes (id) on delete cascade,
  pessoa_id integer not null references pessoas (id),
  bp integer not null check (bp between 1 and 10000),
  primary key (movimentacao_id, pessoa_id)
);

create table categorias (
  nome text primary key
);
insert into categorias (nome) values
  ('mercado'), ('alimentação fora'), ('lazer'), ('transporte'), ('moradia'),
  ('saúde'), ('assinaturas'), ('compras'), ('outros');

create table memoria_estabelecimento (
  estabelecimento_norm text primary key,
  categoria text not null
);

create table orcamentos (
  categoria text primary key,
  limite_centavos integer not null check (limite_centavos > 0),
  aviso80_mes text,
  aviso100_mes text
);

create table contas_a_pagar (
  id integer primary key,
  nome text not null,
  nome_norm text not null unique,
  valor_centavos integer not null,
  dia integer not null check (dia between 1 and 31),
  pago_mes text,
  ultimo_lembrete text
);

create table faturas (
  conta_id integer not null references contas (id),
  ref text not null,
  fechada integer not null default 0,
  resumo_enviado integer not null default 0,
  pendencias_avisadas_em text,
  vencimento_avisado integer not null default 0,
  primary key (conta_id, ref)
);

create table perguntas (
  id integer primary key,
  movimentacao_id integer not null unique references movimentacoes (id),
  mensagem_id text not null,
  aberta integer not null default 1
);
create index perguntas_mensagem on perguntas (mensagem_id);

create table estado (
  chave text primary key,
  valor text
);
