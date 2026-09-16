create table if not exists public.relatorios_inadimplencia_unificados (
  id uuid primary key default gen_random_uuid(),
  carteira_id uuid not null references public.carteiras(id) on delete cascade,
  condominio_id uuid not null references public.condominios(id) on delete cascade,
  conversao_relatorio_id uuid not null references public.conversoes_relatorio(id) on delete cascade,
  status text not null default 'pendente' check (status in ('pendente', 'processando', 'pronto', 'gerado', 'erro', 'cancelado')),
  origem text not null default 'captacao_maestro',
  competencia text not null,
  data_base_financeira date,
  elegivel_em timestamptz not null default (now() + interval '15 minutes'),
  iniciado_em timestamptz,
  finalizado_em timestamptz,
  tentativas integer not null default 0,
  jur_consulta_status text check (jur_consulta_status in ('sucesso', 'erro')),
  jur_consultado_em timestamptz,
  jur_snapshot_json jsonb,
  preview_json jsonb not null default '{}'::jsonb,
  erro_mensagem text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (conversao_relatorio_id)
);

create index if not exists relatorios_inadimplencia_unificados_fila_idx
  on public.relatorios_inadimplencia_unificados (status, elegivel_em)
  where status = 'pendente';

create index if not exists relatorios_inadimplencia_unificados_condominio_idx
  on public.relatorios_inadimplencia_unificados (condominio_id, competencia);

alter table public.relatorios_inadimplencia_unificados enable row level security;

drop policy if exists relatorios_inadimplencia_unificados_authenticated_select
  on public.relatorios_inadimplencia_unificados;
create policy relatorios_inadimplencia_unificados_authenticated_select
  on public.relatorios_inadimplencia_unificados
  for select
  to authenticated
  using (true);

revoke all on table public.relatorios_inadimplencia_unificados from anon;
grant select on table public.relatorios_inadimplencia_unificados to authenticated;

comment on table public.relatorios_inadimplencia_unificados is
  'Fila posterior à captação do Maestro para cruzar inadimplência completa com snapshot processual do GKIT-Jur e preparar o relatório unificado.';

comment on column public.relatorios_inadimplencia_unificados.elegivel_em is
  'Momento mínimo para processamento do relatório, evitando concorrer com a captação e a conversão financeira do Maestro.';

comment on column public.relatorios_inadimplencia_unificados.jur_snapshot_json is
  'Snapshot imutável do retorno jur-report-v1 do GKIT-Jur, ou do erro de consulta, usado para auditoria e reprodutibilidade.';
