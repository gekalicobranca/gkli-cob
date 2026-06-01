-- Sprint T1 — Templates Premium Operacionais
-- Execute após R1/R2.

alter table if exists public.mensagens_templates
  add column if not exists tipo_regua text,
  add column if not exists categoria text,
  add column if not exists intensidade text,
  add column if not exists prioridade integer not null default 0,
  add column if not exists escopo text generated always as (case when carteira_id is null then 'global' else 'carteira' end) stored,
  add column if not exists versao integer not null default 1,
  add column if not exists analytics jsonb not null default '{}'::jsonb;

update public.mensagens_templates
set tipo_regua = coalesce(tipo_regua, nullif(tipo, ''), 'cobranca'),
    categoria = coalesce(categoria, case when coalesce(tipo, tipo_regua) = 'acordo' then 'lembrete_acordo' else 'cobranca_inicial' end),
    intensidade = coalesce(intensidade, 'medio'),
    prioridade = coalesce(prioridade, 0)
where tipo_regua is null or categoria is null or intensidade is null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'mensagens_templates_tipo_regua_check') then
    alter table public.mensagens_templates add constraint mensagens_templates_tipo_regua_check check (tipo_regua in ('cobranca','acordo','manual','juridico')) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'mensagens_templates_intensidade_check') then
    alter table public.mensagens_templates add constraint mensagens_templates_intensidade_check check (intensidade in ('leve','medio','agressivo')) not valid;
  end if;
end $$;

create index if not exists idx_mensagens_templates_resolver
  on public.mensagens_templates (ativo, tipo_regua, categoria, intensidade, canal, carteira_id, prioridade desc);

alter table if exists public.regua_etapas
  add column if not exists categoria_template text;

update public.regua_etapas
set categoria_template = coalesce(
  categoria_template,
  case
    when delay_referencia in ('parcela','acordo') then 'lembrete_acordo'
    when tom = 'agressivo' then 'pre_juridico'
    when tom = 'medio' then 'cobranca_media'
    else 'cobranca_inicial'
  end
)
where categoria_template is null;

create index if not exists idx_regua_etapas_categoria_template
  on public.regua_etapas (categoria_template);

create table if not exists public.mensagens_templates_metricas (
  id uuid primary key default gen_random_uuid(),
  template_id uuid references public.mensagens_templates(id) on delete cascade,
  carteira_id uuid references public.carteiras(id) on delete set null,
  tipo_regua text,
  categoria text,
  intensidade text,
  canal text,
  total_geradas integer not null default 0,
  total_aprovadas integer not null default 0,
  total_enviadas integer not null default 0,
  total_retornos integer not null default 0,
  total_promessas integer not null default 0,
  total_acordos integer not null default 0,
  total_pagamentos integer not null default 0,
  total_falhas integer not null default 0,
  atualizado_em timestamptz not null default now(),
  unique (template_id, carteira_id)
);

create index if not exists idx_mensagens_templates_metricas_rank
  on public.mensagens_templates_metricas (tipo_regua, categoria, intensidade, canal, total_retornos desc, total_acordos desc);

create or replace view public.v_mensagens_templates_resolucao as
select
  mt.id,
  mt.nome,
  mt.carteira_id,
  c.nome as carteira_nome,
  mt.escopo,
  mt.tipo_regua,
  mt.categoria,
  mt.intensidade,
  mt.canal,
  mt.prioridade,
  mt.ativo,
  mt.updated_at,
  coalesce(m.total_geradas, 0) as total_geradas,
  coalesce(m.total_retornos, 0) as total_retornos,
  coalesce(m.total_acordos, 0) as total_acordos,
  coalesce(m.total_pagamentos, 0) as total_pagamentos,
  coalesce(m.total_falhas, 0) as total_falhas
from public.mensagens_templates mt
left join public.carteiras c on c.id = mt.carteira_id
left join public.mensagens_templates_metricas m on m.template_id = mt.id and m.carteira_id is not distinct from mt.carteira_id;

-- Biblioteca oficial GKLI mínima. Use ON CONFLICT conservador pelo nome.
insert into public.mensagens_templates (nome, tipo, tipo_regua, categoria, intensidade, canal, assunto, conteudo, ativo, prioridade, created_at, updated_at)
values
('GKLI · Cobrança inicial leve · WhatsApp', 'cobranca', 'cobranca', 'cobranca_inicial', 'leve', 'whatsapp', null, 'Olá, {{primeiro_nome}}. Identificamos uma pendência da unidade {{unidade}} no {{condominio}}, vinculada à {{carteira}}. Valor atualizado: {{valor}}. Podemos auxiliar na regularização?', true, 10, now(), now()),
('GKLI · Cobrança média · WhatsApp', 'cobranca', 'cobranca', 'cobranca_media', 'medio', 'whatsapp', null, 'Olá, {{primeiro_nome}}. A unidade {{unidade}} do {{condominio}} segue com débito em aberto de {{valor}}. Para evitar avanço da cobrança, regularize ou fale conosco.', true, 10, now(), now()),
('GKLI · Pré-jurídico · E-mail', 'cobranca', 'cobranca', 'pre_juridico', 'agressivo', 'email', 'Pendência condominial em aberto', 'Olá, {{primeiro_nome}}. O débito da unidade {{unidade}} no {{condominio}} permanece em aberto. A ausência de regularização poderá levar ao encaminhamento jurídico. Valor atualizado: {{valor}}.', true, 10, now(), now()),
('GKLI · Lembrete de acordo · WhatsApp', 'acordo', 'acordo', 'lembrete_acordo', 'leve', 'whatsapp', null, 'Olá, {{primeiro_nome}}. Lembramos que a parcela {{parcela}} do acordo da unidade {{unidade}} vence em {{vencimento}}. Valor: {{valor_parcela}}.', true, 10, now(), now()),
('GKLI · Atraso de acordo · WhatsApp', 'acordo', 'acordo', 'atraso_acordo', 'medio', 'whatsapp', null, 'Olá, {{primeiro_nome}}. Identificamos atraso na parcela {{parcela}} do acordo da unidade {{unidade}}. Podemos ajudar na regularização?', true, 10, now(), now())
on conflict do nothing;
