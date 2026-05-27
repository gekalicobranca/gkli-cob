-- GKLI Cobrança — hotfix ADM1 codigo_rastreio
-- Use se a migração ADM1 falhou com: column "codigo_rastreio" does not exist.

create extension if not exists pgcrypto;

create table if not exists public.lotes_administradora (
  id uuid primary key default gen_random_uuid(),
  carteira_id uuid references public.carteiras(id),
  tipo text not null default 'atualizacao_planilha_mensal',
  competencia text,
  status text not null default 'preparado',
  total_itens integer not null default 0,
  total_enviados integer not null default 0,
  total_respondidos integer not null default 0,
  observacoes text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create table if not exists public.administradora_contatos (
  id uuid primary key default gen_random_uuid(),
  administradora_id uuid not null references public.administradoras(id) on delete cascade,
  nome text not null,
  cargo text,
  setor text,
  email text,
  telefone text,
  whatsapp text,
  principal boolean not null default false,
  recebe_cobranca boolean not null default false,
  recebe_boleto boolean not null default false,
  recebe_planilha boolean not null default false,
  ativo boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.solicitacoes_administradora (
  id uuid primary key default gen_random_uuid(),
  administradora_id uuid not null references public.administradoras(id),
  tipo text not null,
  status text not null default 'preparado',
  created_at timestamptz not null default now()
);

alter table public.solicitacoes_administradora
  add column if not exists lote_id uuid references public.lotes_administradora(id) on delete set null,
  add column if not exists carteira_id uuid references public.carteiras(id),
  add column if not exists contato_id uuid references public.administradora_contatos(id) on delete set null,
  add column if not exists condominio_id uuid references public.condominios(id) on delete set null,
  add column if not exists unidade_id uuid references public.unidades(id) on delete set null,
  add column if not exists cobranca_id uuid references public.cobrancas(id) on delete set null,
  add column if not exists acordo_id uuid references public.acordos(id) on delete set null,
  add column if not exists prioridade text default 'normal',
  add column if not exists responsavel_interno text,
  add column if not exists canal text default 'email',
  add column if not exists codigo_rastreio text,
  add column if not exists assunto text,
  add column if not exists mensagem text,
  add column if not exists competencia_planilha text,
  add column if not exists prazo_resposta timestamptz,
  add column if not exists data_resposta timestamptz,
  add column if not exists ultima_interacao_em timestamptz,
  add column if not exists origem_retorno text default 'manual',
  add column if not exists status_retorno text,
  add column if not exists email_thread_id text,
  add column if not exists email_message_id text,
  add column if not exists provedor_email text,
  add column if not exists observacoes text,
  add column if not exists observacoes_retorno text,
  add column if not exists updated_at timestamptz default now();

update public.solicitacoes_administradora
set codigo_rastreio = 'GKLI-ADM-' || upper(substr(id::text,1,8))
where codigo_rastreio is null;

alter table public.solicitacoes_administradora
  alter column codigo_rastreio set default ('GKLI-ADM-' || upper(substr(gen_random_uuid()::text,1,8))),
  alter column codigo_rastreio set not null,
  alter column origem_retorno set default 'manual',
  alter column updated_at set default now();

create unique index if not exists solicitacoes_administradora_codigo_rastreio_key
  on public.solicitacoes_administradora(codigo_rastreio);

create index if not exists solicitacoes_adm_fila_idx
  on public.solicitacoes_administradora(status, prazo_resposta, created_at desc);

create index if not exists solicitacoes_adm_vinculos_idx
  on public.solicitacoes_administradora(administradora_id, condominio_id, unidade_id, acordo_id);
