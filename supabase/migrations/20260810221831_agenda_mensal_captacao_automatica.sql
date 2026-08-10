alter table public.condominios
  add column if not exists captacao_dia_mes smallint,
  add column if not exists captacao_horario time without time zone not null default '08:00';

alter table public.condominios add constraint condominios_captacao_dia_mes_check
  check (captacao_dia_mes is null or captacao_dia_mes between 1 and 28);

alter table public.agente_execucoes
  add column if not exists condominio_id uuid references public.condominios(id) on delete set null,
  add column if not exists origem text not null default 'manual',
  add column if not exists competencia text;

create unique index if not exists agente_execucoes_agenda_mensal_unica_idx
  on public.agente_execucoes (condominio_id, receita_id, competencia)
  where origem = 'agenda_mensal' and competencia is not null;

create index if not exists condominios_captacao_agenda_idx
  on public.condominios (captacao_dia_mes, captacao_horario)
  where captacao_automatica_habilitada = true and status = 'ativo';
