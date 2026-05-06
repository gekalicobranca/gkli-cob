-- GKLI Cobrança — Conversão de Relatório V1
-- Objetivo: preparar estrutura para converter relatórios de administradoras em cobranças + parcelas.

alter table cobrancas
  add column if not exists origem_importacao text,
  add column if not exists conversao_relatorio_id uuid;

create table if not exists conversoes_relatorio (
  id uuid primary key default gen_random_uuid(),
  carteira_id uuid,
  condominio_id uuid,
  origem text not null,
  nome_arquivo text,
  status text not null default 'preview',
  total_cobrancas integer not null default 0,
  total_parcelas integer not null default 0,
  valor_total numeric(14,2) not null default 0,
  preview_json jsonb,
  inconsistencias_json jsonb,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create table if not exists cobranca_parcelas (
  id uuid primary key default gen_random_uuid(),
  cobranca_id uuid not null references cobrancas(id) on delete cascade,
  conversao_relatorio_id uuid references conversoes_relatorio(id) on delete set null,
  data_vencimento date not null,
  referencia text,
  valor_original numeric(14,2) not null default 0,
  valor_atualizado numeric(14,2) not null default 0,
  status text not null default 'aberto',
  origem_linha_json jsonb,
  criado_em timestamptz not null default now()
);

create index if not exists idx_cobranca_parcelas_cobranca_id
  on cobranca_parcelas(cobranca_id);

create index if not exists idx_cobranca_parcelas_vencimento
  on cobranca_parcelas(data_vencimento);

create index if not exists idx_conversoes_relatorio_condominio
  on conversoes_relatorio(condominio_id);
