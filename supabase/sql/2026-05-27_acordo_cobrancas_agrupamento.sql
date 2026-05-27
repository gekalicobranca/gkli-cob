-- GKLI Cobrança — agrupamento de cobranças em acordos
-- Permite que um acordo seja composto por múltiplas cobranças da mesma unidade,
-- preservando o vínculo auditável entre acordo e recibos/vencimentos selecionados.

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

-- Durante o desenvolvimento, mantém o mesmo padrão permissivo usado nas tabelas operacionais
-- quando a aplicação já controla acesso por server actions e escopo de carteira.
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

-- Backfill seguro: acordos antigos com uma única cobranca_id passam a aparecer
-- também na nova tabela de vínculo, sem duplicar registros já existentes.
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
