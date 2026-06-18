-- GKLI Cobrança — Sprint R1 Réguas
-- Editor visual de réguas, vínculo por condomínio, cockpit de lotes e retornos manuais.
-- Seguro para rodar mais de uma vez.

create extension if not exists pgcrypto;

-- 1) Réguas operacionais
create table if not exists public.reguas (
  id uuid primary key default gen_random_uuid(),
  carteira_id uuid null references public.carteiras(id) on delete set null,
  nome text not null,
  tipo text not null default 'cobranca' check (tipo in ('cobranca','acordo')),
  status text not null default 'ativa' check (status in ('ativa','rascunho','inativa')),
  descricao text null,
  prioridade integer not null default 0,
  padrao boolean not null default false,
  destinatario_preferencial text not null default 'proprietario',
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.reguas add column if not exists carteira_id uuid null references public.carteiras(id) on delete set null;
alter table public.reguas add column if not exists nome text;
alter table public.reguas add column if not exists tipo text not null default 'cobranca';
alter table public.reguas add column if not exists status text not null default 'ativa';
alter table public.reguas add column if not exists descricao text null;
alter table public.reguas add column if not exists prioridade integer not null default 0;
alter table public.reguas add column if not exists padrao boolean not null default false;
alter table public.reguas add column if not exists destinatario_preferencial text not null default 'proprietario';
alter table public.reguas add column if not exists ativo boolean not null default true;
alter table public.reguas add column if not exists created_at timestamptz not null default now();
alter table public.reguas add column if not exists updated_at timestamptz not null default now();

do $$
begin
  if to_regclass('public.reguas') is not null then
    alter table public.reguas
      drop constraint if exists reguas_destinatario_preferencial_check;

    alter table public.reguas
      add constraint reguas_destinatario_preferencial_check
      check (destinatario_preferencial in ('proprietario','inquilino','qualquer'));
  end if;
end $$;

create index if not exists idx_reguas_tipo_status on public.reguas(tipo, status);
create index if not exists idx_reguas_carteira on public.reguas(carteira_id);
create index if not exists reguas_destinatario_preferencial_idx on public.reguas(destinatario_preferencial);
create unique index if not exists idx_reguas_padrao_unica_por_escopo
  on public.reguas(coalesce(carteira_id, '00000000-0000-0000-0000-000000000000'::uuid), tipo)
  where padrao = true and ativo = true and status = 'ativa';

-- 2) Etapas configuráveis
create table if not exists public.regua_etapas (
  id uuid primary key default gen_random_uuid(),
  regua_id uuid not null references public.reguas(id) on delete cascade,
  ordem integer not null default 1,
  nome text null,
  delay_dias integer not null default 0,
  delay_referencia text not null default 'vencimento',
  canal text not null default 'whatsapp',
  template_id uuid null references public.mensagens_templates(id) on delete set null,
  template text not null,
  tom text not null default 'medio',
  horario_inicio time null default '09:00',
  horario_fim time null default '18:00',
  acao text not null default 'enviar_mensagem',
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.regua_etapas add column if not exists regua_id uuid references public.reguas(id) on delete cascade;
alter table public.regua_etapas add column if not exists ordem integer not null default 1;
alter table public.regua_etapas add column if not exists nome text null;
alter table public.regua_etapas add column if not exists delay_dias integer not null default 0;
alter table public.regua_etapas add column if not exists delay_referencia text not null default 'vencimento';
alter table public.regua_etapas add column if not exists canal text not null default 'whatsapp';
alter table public.regua_etapas add column if not exists template_id uuid null references public.mensagens_templates(id) on delete set null;
alter table public.regua_etapas add column if not exists template text;
alter table public.regua_etapas add column if not exists tom text not null default 'medio';
alter table public.regua_etapas add column if not exists horario_inicio time null default '09:00';
alter table public.regua_etapas add column if not exists horario_fim time null default '18:00';
alter table public.regua_etapas add column if not exists acao text not null default 'enviar_mensagem';
alter table public.regua_etapas add column if not exists ativo boolean not null default true;
alter table public.regua_etapas add column if not exists created_at timestamptz not null default now();
alter table public.regua_etapas add column if not exists updated_at timestamptz not null default now();

create index if not exists idx_regua_etapas_regua_ordem on public.regua_etapas(regua_id, ordem);
create index if not exists idx_regua_etapas_ativas on public.regua_etapas(regua_id, ativo);

-- 3) Associação de régua por condomínio
alter table public.condominios add column if not exists regua_cobranca_id uuid null references public.reguas(id) on delete set null;
alter table public.condominios add column if not exists regua_acordo_id uuid null references public.reguas(id) on delete set null;
create index if not exists idx_condominios_regua_cobranca on public.condominios(regua_cobranca_id);
create index if not exists idx_condominios_regua_acordo on public.condominios(regua_acordo_id);

-- 4) Cockpit de lotes: revisão item-a-item e retornos manuais
alter table public.lote_itens add column if not exists aprovado_em timestamptz null;
alter table public.lote_itens add column if not exists cancelado_em timestamptz null;
alter table public.lote_itens add column if not exists operador_id uuid null;
alter table public.lote_itens add column if not exists erro text null;
alter table public.lote_itens add column if not exists retorno_tipo text null;
alter table public.lote_itens add column if not exists retorno_observacao text null;
alter table public.lote_itens add column if not exists retorno_origem text null default 'manual';
alter table public.lote_itens add column if not exists retorno_registrado_em timestamptz null;
alter table public.lote_itens add column if not exists pausado_ate timestamptz null;
create index if not exists idx_lote_itens_retorno on public.lote_itens(retorno_tipo, retorno_registrado_em);

alter table public.mensagens add column if not exists status_operacional text null;
alter table public.mensagens add column if not exists retorno_tipo text null;
alter table public.mensagens add column if not exists retorno_observacao text null;
alter table public.mensagens add column if not exists retorno_origem text null;
alter table public.mensagens add column if not exists retorno_registrado_em timestamptz null;
alter table public.mensagens add column if not exists updated_at timestamptz null;
create index if not exists idx_mensagens_retorno on public.mensagens(retorno_tipo, retorno_registrado_em);

-- 5) Timeline: campos usados pelo cockpit e por automações futuras.
create table if not exists public.timeline_operacional (
  id uuid primary key default gen_random_uuid(),
  carteira_id uuid null,
  entidade_tipo text not null,
  entidade_id uuid null,
  evento_tipo text not null,
  titulo text not null,
  descricao text null,
  severidade text not null default 'info',
  status_anterior text null,
  status_novo text null,
  condominio_id uuid null,
  unidade_id uuid null,
  cobranca_id uuid null,
  acordo_id uuid null,
  administradora_id uuid null,
  solicitacao_administradora_id uuid null,
  lote_id uuid null,
  mensagem_id uuid null,
  usuario_id uuid null,
  usuario_nome text null,
  usuario_email text null,
  origem text not null default 'app',
  payload jsonb not null default '{}'::jsonb,
  ocorreu_em timestamptz not null default now(),
  created_at timestamptz not null default now()
);

alter table public.timeline_operacional add column if not exists usuario_id uuid null;
alter table public.timeline_operacional add column if not exists usuario_nome text null;
alter table public.timeline_operacional add column if not exists usuario_email text null;
alter table public.timeline_operacional add column if not exists origem text not null default 'app';
alter table public.timeline_operacional add column if not exists payload jsonb not null default '{}'::jsonb;
alter table public.timeline_operacional add column if not exists ocorreu_em timestamptz not null default now();
create index if not exists idx_timeline_operacional_ocorreu on public.timeline_operacional(ocorreu_em desc);
create index if not exists idx_timeline_operacional_entidade on public.timeline_operacional(entidade_tipo, entidade_id);
create index if not exists idx_timeline_operacional_cobranca on public.timeline_operacional(cobranca_id);
create index if not exists idx_timeline_operacional_acordo on public.timeline_operacional(acordo_id);
create index if not exists idx_timeline_operacional_lote on public.timeline_operacional(lote_id);

-- 6) Seeds mínimos: réguas padrão globais quando ainda não existirem.
insert into public.reguas (nome, tipo, status, descricao, prioridade, padrao, ativo)
select 'Cobrança padrão GKLI', 'cobranca', 'ativa', 'Régua padrão extrajudicial: D+0, D+3, D+7 e D+15.', 10, true, true
where not exists (select 1 from public.reguas where tipo = 'cobranca' and padrao = true and carteira_id is null);

insert into public.reguas (nome, tipo, status, descricao, prioridade, padrao, ativo)
select 'Acordos padrão GKLI', 'acordo', 'ativa', 'Régua preventiva e pós-vencimento de parcelas de acordo: D-3, D0, D+2 e D+7.', 10, true, true
where not exists (select 1 from public.reguas where tipo = 'acordo' and padrao = true and carteira_id is null);

with r as (select id from public.reguas where tipo = 'cobranca' and padrao = true and carteira_id is null limit 1)
insert into public.regua_etapas (regua_id, ordem, nome, delay_dias, delay_referencia, canal, tom, acao, template)
select r.id, v.ordem, v.nome, v.delay_dias, 'vencimento', 'whatsapp', v.tom, 'enviar_mensagem', v.template
from r, (values
  (1, 'Primeiro contato', 0, 'leve', 'Olá, {{responsavel}}. Identificamos um débito em aberto da unidade {{unidade}} no {{condominio}}, competência {{competencia}}, vencido em {{vencimento}}. Podemos auxiliar na regularização?'),
  (2, 'Reforço amigável', 3, 'medio', 'Olá, {{responsavel}}. Consta pendência da unidade {{unidade}} no {{condominio}}, valor atualizado {{valor}}. Podemos seguir com a regularização?'),
  (3, 'Alerta operacional', 7, 'medio', 'Olá, {{responsavel}}. O débito da unidade {{unidade}} segue pendente. Regularize para evitar avanço da cobrança.'),
  (4, 'Pré-jurídico', 15, 'agressivo', 'Olá, {{responsavel}}. O débito da unidade {{unidade}} no {{condominio}} segue em aberto e poderá ser encaminhado para medidas jurídicas.')
) as v(ordem, nome, delay_dias, tom, template)
where not exists (select 1 from public.regua_etapas e where e.regua_id = r.id);

with r as (select id from public.reguas where tipo = 'acordo' and padrao = true and carteira_id is null limit 1)
insert into public.regua_etapas (regua_id, ordem, nome, delay_dias, delay_referencia, canal, tom, acao, template)
select r.id, v.ordem, v.nome, v.delay_dias, 'parcela', 'whatsapp', v.tom, 'enviar_mensagem', v.template
from r, (values
  (1, 'Lembrete preventivo', -3, 'leve', 'Olá, {{responsavel}}. Passando para lembrar que a parcela {{parcela_numero}} do acordo da unidade {{unidade}} vence em {{vencimento}}, no valor de {{valor_parcela}}.'),
  (2, 'Vence hoje', 0, 'medio', 'Olá, {{responsavel}}. A parcela {{parcela_numero}} do acordo da unidade {{unidade}} vence hoje, no valor de {{valor_parcela}}. Podemos confirmar o pagamento?'),
  (3, 'Parcela vencida', 2, 'medio', 'Olá, {{responsavel}}. A parcela {{parcela_numero}} do acordo da unidade {{unidade}} está vencida desde {{vencimento}}. Regularize para manter as condições pactuadas.'),
  (4, 'Risco de quebra', 7, 'agressivo', 'Olá, {{responsavel}}. O acordo da unidade {{unidade}} segue com parcela vencida. A ausência de regularização poderá caracterizar quebra do acordo.')
) as v(ordem, nome, delay_dias, tom, template)
where not exists (select 1 from public.regua_etapas e where e.regua_id = r.id);
