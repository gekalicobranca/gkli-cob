-- GKLI Cobrança · R2 Réguas
-- Scheduler, suspensão inteligente, compliance operacional e primeira camada de inteligência.
-- Seguro para rodar mais de uma vez.

create extension if not exists pgcrypto;

create table if not exists public.regua_jobs (
  id uuid primary key default gen_random_uuid(),
  tipo text not null check (tipo in ('regua_cobranca', 'regua_acordo', 'scheduler')),
  origem text not null default 'cron',
  status text not null default 'pendente' check (status in ('pendente', 'processando', 'concluido', 'erro')),
  iniciado_em timestamptz,
  finalizado_em timestamptz,
  erro text,
  resumo jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_regua_jobs_tipo_status on public.regua_jobs(tipo, status, iniciado_em desc);

create table if not exists public.regua_pausas (
  id uuid primary key default gen_random_uuid(),
  carteira_id uuid null references public.carteiras(id) on delete set null,
  cobranca_id uuid null references public.cobrancas(id) on delete cascade,
  acordo_id uuid null references public.acordos(id) on delete cascade,
  unidade_id uuid null references public.unidades(id) on delete cascade,
  condominio_id uuid null references public.condominios(id) on delete cascade,
  regra_codigo text,
  motivo text not null,
  origem text not null default 'manual',
  pausa_ate timestamptz,
  ativo boolean not null default true,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (cobranca_id is not null or acordo_id is not null or unidade_id is not null or condominio_id is not null)
);

create index if not exists idx_regua_pausas_cobranca_ativa on public.regua_pausas(cobranca_id, ativo, pausa_ate);
create index if not exists idx_regua_pausas_acordo_ativa on public.regua_pausas(acordo_id, ativo, pausa_ate);
create index if not exists idx_regua_pausas_unidade_ativa on public.regua_pausas(unidade_id, ativo, pausa_ate);
create index if not exists idx_regua_pausas_condominio_ativa on public.regua_pausas(condominio_id, ativo, pausa_ate);

create table if not exists public.regua_compliance_regras (
  id uuid primary key default gen_random_uuid(),
  carteira_id uuid null references public.carteiras(id) on delete cascade,
  nome text not null default 'Regra padrão',
  canal text null check (canal is null or canal in ('whatsapp', 'email', 'manual', 'todos')),
  ativo boolean not null default true,
  janela_inicio time not null default time '08:00',
  janela_fim time not null default time '20:00',
  limite_diario_destinatario integer not null default 3 check (limite_diario_destinatario >= 1),
  intervalo_minimo_minutos integer not null default 120 check (intervalo_minimo_minutos >= 0),
  permitir_finais_semana boolean not null default false,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_regua_compliance_carteira on public.regua_compliance_regras(carteira_id, ativo, canal);

insert into public.regua_compliance_regras (nome, canal, ativo, janela_inicio, janela_fim, limite_diario_destinatario, intervalo_minimo_minutos, permitir_finais_semana)
select 'Regra global segura', null, true, time '08:00', time '20:00', 3, 120, false
where not exists (select 1 from public.regua_compliance_regras where carteira_id is null and nome = 'Regra global segura');

create table if not exists public.regua_destinatarios_bloqueados (
  id uuid primary key default gen_random_uuid(),
  carteira_id uuid null references public.carteiras(id) on delete cascade,
  destinatario text not null,
  canal text not null default 'todos' check (canal in ('whatsapp', 'email', 'todos')),
  motivo text,
  origem text not null default 'manual',
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (destinatario, canal)
);

create index if not exists idx_regua_destinatarios_bloqueados_lookup on public.regua_destinatarios_bloqueados(destinatario, canal, ativo);

create table if not exists public.regua_inteligencia_scores (
  id uuid primary key default gen_random_uuid(),
  carteira_id uuid null references public.carteiras(id) on delete set null,
  cobranca_id uuid null references public.cobrancas(id) on delete cascade,
  acordo_id uuid null references public.acordos(id) on delete cascade,
  unidade_id uuid null references public.unidades(id) on delete set null,
  condominio_id uuid null references public.condominios(id) on delete set null,
  score_recuperacao integer not null default 50 check (score_recuperacao between 0 and 100),
  risco_quebra integer not null default 50 check (risco_quebra between 0 and 100),
  prioridade_operacional integer not null default 50 check (prioridade_operacional between 0 and 100),
  melhor_canal text,
  melhor_horario text,
  intensidade_sugerida text,
  recomendacao text,
  payload jsonb not null default '{}'::jsonb,
  calculado_em timestamptz not null default now(),
  created_at timestamptz not null default now(),
  check (cobranca_id is not null or acordo_id is not null)
);

create unique index if not exists ux_regua_inteligencia_scores_cobranca on public.regua_inteligencia_scores(cobranca_id) where cobranca_id is not null;
create unique index if not exists ux_regua_inteligencia_scores_acordo on public.regua_inteligencia_scores(acordo_id) where acordo_id is not null;
create index if not exists idx_regua_inteligencia_scores_carteira on public.regua_inteligencia_scores(carteira_id, calculado_em desc);

alter table if exists public.lote_itens add column if not exists compliance_status text;
alter table if exists public.lote_itens add column if not exists score_operacional integer;
alter table if exists public.mensagens add column if not exists origem_evento text;
alter table if exists public.mensagens add column if not exists retorno_automatico_payload jsonb not null default '{}'::jsonb;

create or replace function public.gkli_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_regua_pausas_updated_at on public.regua_pausas;
create trigger trg_regua_pausas_updated_at
before update on public.regua_pausas
for each row execute function public.gkli_set_updated_at();

drop trigger if exists trg_regua_compliance_updated_at on public.regua_compliance_regras;
create trigger trg_regua_compliance_updated_at
before update on public.regua_compliance_regras
for each row execute function public.gkli_set_updated_at();

drop trigger if exists trg_regua_destinatarios_bloqueados_updated_at on public.regua_destinatarios_bloqueados;
create trigger trg_regua_destinatarios_bloqueados_updated_at
before update on public.regua_destinatarios_bloqueados
for each row execute function public.gkli_set_updated_at();

alter table public.regua_jobs enable row level security;
alter table public.regua_pausas enable row level security;
alter table public.regua_compliance_regras enable row level security;
alter table public.regua_destinatarios_bloqueados enable row level security;
alter table public.regua_inteligencia_scores enable row level security;

-- Políticas permissivas para app autenticado; o service role continua usado nos workers.
do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='regua_jobs' and policyname='regua_jobs_authenticated_read') then
    create policy regua_jobs_authenticated_read on public.regua_jobs for select to authenticated using (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='regua_pausas' and policyname='regua_pausas_authenticated_read') then
    create policy regua_pausas_authenticated_read on public.regua_pausas for select to authenticated using (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='regua_compliance_regras' and policyname='regua_compliance_authenticated_read') then
    create policy regua_compliance_authenticated_read on public.regua_compliance_regras for select to authenticated using (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='regua_destinatarios_bloqueados' and policyname='regua_bloqueados_authenticated_read') then
    create policy regua_bloqueados_authenticated_read on public.regua_destinatarios_bloqueados for select to authenticated using (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='regua_inteligencia_scores' and policyname='regua_scores_authenticated_read') then
    create policy regua_scores_authenticated_read on public.regua_inteligencia_scores for select to authenticated using (true);
  end if;
end $$;
