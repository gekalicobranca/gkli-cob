-- RLS para formalizacao de acordos.
-- Corrige erro ao criar termo:
-- new row violates row-level security policy for table "acordos_termos"

alter table public.acordos_termos enable row level security;
alter table public.acordos_aceites enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'acordos_termos'
      and policyname = 'acordos_termos_authenticated_all'
  ) then
    create policy acordos_termos_authenticated_all
      on public.acordos_termos
      for all
      to authenticated
      using (true)
      with check (true);
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'acordos_aceites'
      and policyname = 'acordos_aceites_authenticated_all'
  ) then
    create policy acordos_aceites_authenticated_all
      on public.acordos_aceites
      for all
      to authenticated
      using (true)
      with check (true);
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'acordos_termos'
      and policyname = 'acordos_termos_public_read'
  ) then
    create policy acordos_termos_public_read
      on public.acordos_termos
      for select
      to anon
      using (true);
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'acordos_termos'
      and policyname = 'acordos_termos_public_accept'
  ) then
    create policy acordos_termos_public_accept
      on public.acordos_termos
      for update
      to anon
      using (status in ('pendente', 'visualizado'))
      with check (status in ('visualizado', 'aceito', 'recusado', 'expirado'));
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'acordos_aceites'
      and policyname = 'acordos_aceites_public_insert'
  ) then
    create policy acordos_aceites_public_insert
      on public.acordos_aceites
      for insert
      to anon
      with check (true);
  end if;
end $$;
