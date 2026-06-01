-- GKLI Cobranca - patch live de schema para acordos, aceite e ADM
-- Data: 2026-06-01
--
-- Objetivo:
-- - alinhar o banco live ao codigo atual sem alterar dados existentes de forma destrutiva;
-- - restaurar no trilho oficial supabase/sql o schema do fluxo formal de acordo/aceite;
-- - aplicar lacunas ADM confirmadas no live;
-- - manter o script idempotente e seguro para rodar mais de uma vez.
--
-- Fora do escopo:
-- - corrigir codigo de conversao de relatorio;
-- - criar mensagens.atualizado_em;
-- - renomear/remover colunas legadas.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- 1) Agrupamento de cobrancas em acordos
-- ---------------------------------------------------------------------------

create table if not exists public.acordo_cobrancas (
  id uuid primary key default gen_random_uuid(),
  acordo_id uuid not null references public.acordos(id) on delete cascade,
  cobranca_id uuid not null references public.cobrancas(id) on delete restrict,
  valor_original_no_acordo numeric(14,2) not null default 0,
  valor_atualizado_no_acordo numeric(14,2) not null default 0,
  encargos_no_acordo numeric(14,2) not null default 0,
  valor_total_no_acordo numeric(14,2) not null default 0,
  criado_em timestamptz not null default now(),
  constraint acordo_cobrancas_unique unique (acordo_id, cobranca_id),
  constraint acordo_cobrancas_valores_check check (
    valor_original_no_acordo >= 0
    and valor_atualizado_no_acordo >= 0
    and encargos_no_acordo >= 0
    and valor_total_no_acordo >= 0
  )
);

create index if not exists acordo_cobrancas_acordo_id_idx
  on public.acordo_cobrancas(acordo_id);

create index if not exists acordo_cobrancas_cobranca_id_idx
  on public.acordo_cobrancas(cobranca_id);

alter table public.acordo_cobrancas enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'acordo_cobrancas'
      and policyname = 'acordo_cobrancas_authenticated_all'
  ) then
    create policy acordo_cobrancas_authenticated_all
      on public.acordo_cobrancas
      for all
      to authenticated
      using (true)
      with check (true);
  end if;
end $$;

insert into public.acordo_cobrancas (
  acordo_id,
  cobranca_id,
  valor_original_no_acordo,
  valor_atualizado_no_acordo,
  encargos_no_acordo,
  valor_total_no_acordo
)
select
  a.id,
  a.cobranca_id,
  coalesce(c.valor_original, 0),
  coalesce(c.valor_atualizado, c.valor_original, 0),
  coalesce(a.despesa_cobranca_valor, 0),
  coalesce(a.valor_acordado, coalesce(c.valor_atualizado, c.valor_original, 0))
from public.acordos a
join public.cobrancas c on c.id = a.cobranca_id
where a.cobranca_id is not null
on conflict (acordo_id, cobranca_id) do nothing;

-- ---------------------------------------------------------------------------
-- 2) Fluxo formal de acordo, aceite publico e boletos
-- ---------------------------------------------------------------------------

alter table public.acordos
  add column if not exists fluxo_status text default 'aguardando_aceite_devedor',
  add column if not exists exige_aprovacao_sindico boolean not null default false,
  add column if not exists sindico_aprovado_em timestamptz,
  add column if not exists devedor_aceito_em timestamptz,
  add column if not exists boletos_solicitados_em timestamptz,
  add column if not exists boletos_emitidos_em timestamptz;

update public.acordos
set fluxo_status = 'aguardando_aceite_devedor'
where fluxo_status is null;

alter table public.acordos
  alter column fluxo_status set default 'aguardando_aceite_devedor',
  alter column fluxo_status set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'acordos_fluxo_status_chk'
      and conrelid = 'public.acordos'::regclass
  ) then
    alter table public.acordos
      add constraint acordos_fluxo_status_chk
      check (fluxo_status in (
        'aguardando_aprovacao_sindico',
        'aprovado_sindico_aguardando_aceite_devedor',
        'aguardando_aceite_devedor',
        'aceito_aguardando_boletos',
        'boletos_solicitados',
        'boletos_recebidos',
        'acordo_efetivado',
        'cancelado'
      ));
  end if;
end $$;

create table if not exists public.acordos_termos (
  id uuid primary key default gen_random_uuid(),
  acordo_id uuid not null references public.acordos(id) on delete cascade,
  carteira_id uuid references public.carteiras(id),
  tipo_aceite text not null check (tipo_aceite in ('devedor', 'sindico')),
  status text not null default 'pendente' check (status in ('pendente', 'visualizado', 'aceito', 'recusado', 'expirado')),
  token text not null unique,
  destinatario_nome text,
  destinatario_documento text,
  destinatario_email text,
  titulo text not null,
  corpo text not null,
  visualizado_em timestamptz,
  aceito_em timestamptz,
  aceite_ip text,
  aceite_user_agent text,
  expira_em timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists acordos_termos_acordo_id_idx
  on public.acordos_termos(acordo_id);

create index if not exists acordos_termos_token_idx
  on public.acordos_termos(token);

create table if not exists public.acordos_aceites (
  id uuid primary key default gen_random_uuid(),
  acordo_id uuid not null references public.acordos(id) on delete cascade,
  termo_id uuid references public.acordos_termos(id) on delete set null,
  tipo_aceite text not null check (tipo_aceite in ('devedor', 'sindico')),
  nome text not null,
  documento text,
  ip text,
  user_agent text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists acordos_aceites_acordo_id_idx
  on public.acordos_aceites(acordo_id);

comment on table public.acordos_termos is
  'Termos publicos de aprovacao/aceite do acordo, com token sem autenticacao.';

comment on table public.acordos_aceites is
  'Carimbos formais de aceite publico: nome, documento, IP, user-agent e payload.';

-- ---------------------------------------------------------------------------
-- 3) Lacunas ADM confirmadas no live
-- ---------------------------------------------------------------------------

alter table public.condominios
  add column if not exists planilha_debitos_competencia text,
  add column if not exists planilha_debitos_atualizada_em timestamptz;

alter table public.cobrancas
  add column if not exists planilha_debitos_competencia text,
  add column if not exists planilha_debitos_atualizada_em timestamptz,
  add column if not exists planilha_debitos_solicitacao_id uuid references public.solicitacoes_administradora(id) on delete set null,
  add column if not exists bloqueio_formalizacao_motivo text;

create index if not exists cobrancas_planilha_competencia_idx
  on public.cobrancas(condominio_id, unidade_id, planilha_debitos_competencia);

create table if not exists public.lote_administradora_itens (
  id uuid primary key default gen_random_uuid(),
  lote_id uuid not null references public.lotes_administradora(id) on delete cascade,
  solicitacao_id uuid references public.solicitacoes_administradora(id) on delete set null,
  administradora_id uuid not null references public.administradoras(id),
  condominio_id uuid references public.condominios(id) on delete set null,
  total_cobrancas integer not null default 0,
  status text not null default 'preparado',
  criado_em timestamptz not null default now()
);

create index if not exists lote_adm_itens_lote_idx
  on public.lote_administradora_itens(lote_id, status);

alter table public.lote_administradora_itens enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'lote_administradora_itens'
      and policyname = 'lote_administradora_itens_authenticated_all'
  ) then
    create policy lote_administradora_itens_authenticated_all
      on public.lote_administradora_itens
      for all
      to authenticated
      using (true)
      with check (true);
  end if;
end $$;

alter table public.logs_operacionais_adm
  add column if not exists origem_retorno text default 'manual',
  add column if not exists payload jsonb not null default '{}'::jsonb;

-- ---------------------------------------------------------------------------
-- 4) View operacional ADM
-- ---------------------------------------------------------------------------

create or replace view public.v_cobrancas_bloqueio_planilha_adm as
select
  c.id as cobranca_id,
  c.carteira_id,
  c.condominio_id,
  c.unidade_id,
  c.created_at as captada_em,
  c.planilha_debitos_competencia,
  to_char(now(), 'YYYY-MM') as competencia_atual,
  (
    c.created_at::date < date_trunc('month', now())::date
    and coalesce(c.planilha_debitos_competencia, '') <> to_char(now(), 'YYYY-MM')
  ) as bloqueada_para_formalizacao
from public.cobrancas c;

