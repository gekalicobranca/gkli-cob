-- GKLI Cobrança — régua padrão + ajustes por condomínio
-- Rode no Supabase SQL editor.

create extension if not exists pgcrypto;

alter table if exists condominios
  add column if not exists inicio_cobranca_dias integer not null default 30,
  add column if not exists intensidade_regua text not null default 'medio',
  add column if not exists regua_cobranca_id uuid,
  add column if not exists regua_acordo_id uuid;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'condominios_inicio_cobranca_dias_check') then
    alter table condominios add constraint condominios_inicio_cobranca_dias_check
    check (inicio_cobranca_dias >= 0 and inicio_cobranca_dias <= 365);
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'condominios_intensidade_regua_check') then
    alter table condominios add constraint condominios_intensidade_regua_check
    check (intensidade_regua in ('leve', 'medio', 'agressivo'));
  end if;
end $$;

create table if not exists reguas (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  tipo text not null check (tipo in ('cobranca', 'acordo')),
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists regua_etapas (
  id uuid primary key default gen_random_uuid(),
  regua_id uuid not null references reguas(id) on delete cascade,
  ordem integer not null,
  delay_dias integer not null default 0,
  canal text not null default 'whatsapp' check (canal in ('whatsapp', 'email')),
  template text not null,
  tom text not null default 'medio' check (tom in ('leve', 'medio', 'agressivo')),
  ativo boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists regua_execucoes (
  id uuid primary key default gen_random_uuid(),
  carteira_id uuid,
  cobranca_id uuid,
  acordo_id uuid,
  regua_etapa_id uuid references regua_etapas(id) on delete set null,
  tipo text not null check (tipo in ('cobranca', 'acordo')),
  canal text not null default 'whatsapp' check (canal in ('whatsapp', 'email')),
  status text not null default 'pendente' check (status in ('pendente', 'enviado', 'erro', 'pulado')),
  tentativa integer not null default 0,
  erro_msg text,
  payload jsonb not null default '{}'::jsonb,
  scheduled_at timestamptz not null default now(),
  executed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists regua_execucoes_cobranca_idx on regua_execucoes(cobranca_id);
create index if not exists regua_execucoes_status_idx on regua_execucoes(status, scheduled_at);
create index if not exists regua_etapas_regua_idx on regua_etapas(regua_id, ordem);

insert into reguas (nome, tipo, ativo)
select 'Régua padrão de cobrança GKLI', 'cobranca', true
where not exists (select 1 from reguas where tipo = 'cobranca' and nome = 'Régua padrão de cobrança GKLI');

insert into reguas (nome, tipo, ativo)
select 'Régua padrão de acordo GKLI', 'acordo', true
where not exists (select 1 from reguas where tipo = 'acordo' and nome = 'Régua padrão de acordo GKLI');

with r as (select id from reguas where nome = 'Régua padrão de cobrança GKLI' limit 1)
insert into regua_etapas (regua_id, ordem, delay_dias, canal, template, tom)
select r.id, v.ordem, v.delay_dias, v.canal, v.template, v.tom
from r,
(values
  (1, 0, 'whatsapp', 'Olá, {{responsavel}}. Identificamos um débito em aberto da unidade {{unidade}} no {{condominio}}, competência {{competencia}}, vencido em {{vencimento}}. Podemos auxiliar na regularização?', 'leve'),
  (2, 3, 'whatsapp', 'Olá, {{responsavel}}. Consta pendência da unidade {{unidade}} no {{condominio}}, valor atualizado {{valor}}. Podemos seguir com a regularização?', 'medio'),
  (3, 7, 'whatsapp', 'Olá, {{responsavel}}. O débito da unidade {{unidade}} segue pendente. Regularize para evitar avanço da cobrança.', 'medio'),
  (4, 15, 'whatsapp', 'Olá, {{responsavel}}. O débito da unidade {{unidade}} no {{condominio}} segue em aberto e poderá ser encaminhado para medidas jurídicas.', 'agressivo')
) as v(ordem, delay_dias, canal, template, tom)
where not exists (select 1 from regua_etapas e where e.regua_id = r.id);

with r as (select id from reguas where nome = 'Régua padrão de acordo GKLI' limit 1)
insert into regua_etapas (regua_id, ordem, delay_dias, canal, template, tom)
select r.id, v.ordem, v.delay_dias, v.canal, v.template, v.tom
from r,
(values
  (1, 1, 'whatsapp', 'Olá, {{responsavel}}. Identificamos parcela de acordo em aberto da unidade {{unidade}}, vencida em {{vencimento}}. Podemos auxiliar na regularização?', 'leve'),
  (2, 3, 'whatsapp', 'Olá, {{responsavel}}. Seu acordo da unidade {{unidade}} está com parcela vencida desde {{vencimento}}. Regularize para manter as condições pactuadas.', 'medio'),
  (3, 7, 'whatsapp', 'Olá, {{responsavel}}. O acordo da unidade {{unidade}} segue inadimplente. A ausência de regularização poderá caracterizar quebra do acordo.', 'agressivo')
) as v(ordem, delay_dias, canal, template, tom)
where not exists (select 1 from regua_etapas e where e.regua_id = r.id);

update condominios
set regua_cobranca_id = (select id from reguas where nome = 'Régua padrão de cobrança GKLI' limit 1)
where regua_cobranca_id is null;

update condominios
set regua_acordo_id = (select id from reguas where nome = 'Régua padrão de acordo GKLI' limit 1)
where regua_acordo_id is null;
