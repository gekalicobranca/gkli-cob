-- Hardening de acesso por carteira para cobrancas e importacoes.
-- Complementa as validacoes das server actions com RLS no banco.
--
-- Observacao: este script assume Supabase Auth e perfis em public.profiles.role.
-- Usuarios admin acessam todas as carteiras; demais usuarios acessam apenas
-- carteiras vinculadas em public.usuarios_carteiras.

create or replace function public.current_user_is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role = 'admin'
  );
$$;

create or replace function public.current_user_can_access_carteira(p_carteira_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.current_user_is_admin()
    or (
      p_carteira_id is not null
      and exists (
        select 1
        from public.usuarios_carteiras uc
        where uc.user_id = auth.uid()
          and uc.carteira_id = p_carteira_id
      )
    );
$$;

create or replace function public.current_user_can_access_importacao(p_importacao_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.importacoes i
    where i.id = p_importacao_id
      and (
        -- Importacoes antigas sem carteira ficam visiveis apenas para admin.
        (i.carteira_id is null and public.current_user_is_admin())
        or public.current_user_can_access_carteira(i.carteira_id)
      )
  );
$$;

grant execute on function public.current_user_is_admin() to authenticated;
grant execute on function public.current_user_can_access_carteira(uuid) to authenticated;
grant execute on function public.current_user_can_access_importacao(uuid) to authenticated;

alter table public.condominios enable row level security;
alter table public.unidades enable row level security;
alter table public.cobrancas enable row level security;
alter table public.interacoes enable row level security;
alter table public.importacoes enable row level security;
alter table public.importacao_itens enable row level security;

drop policy if exists condominios_carteira_scope_all on public.condominios;
create policy condominios_carteira_scope_all
  on public.condominios
  for all
  to authenticated
  using (public.current_user_can_access_carteira(carteira_id))
  with check (public.current_user_can_access_carteira(carteira_id));

drop policy if exists unidades_carteira_scope_all on public.unidades;
create policy unidades_carteira_scope_all
  on public.unidades
  for all
  to authenticated
  using (public.current_user_can_access_carteira(carteira_id))
  with check (public.current_user_can_access_carteira(carteira_id));

drop policy if exists cobrancas_carteira_scope_all on public.cobrancas;
create policy cobrancas_carteira_scope_all
  on public.cobrancas
  for all
  to authenticated
  using (public.current_user_can_access_carteira(carteira_id))
  with check (public.current_user_can_access_carteira(carteira_id));

drop policy if exists interacoes_carteira_scope_all on public.interacoes;
create policy interacoes_carteira_scope_all
  on public.interacoes
  for all
  to authenticated
  using (public.current_user_can_access_carteira(carteira_id))
  with check (public.current_user_can_access_carteira(carteira_id));

drop policy if exists importacoes_carteira_scope_all on public.importacoes;
create policy importacoes_carteira_scope_all
  on public.importacoes
  for all
  to authenticated
  using (
    (carteira_id is null and public.current_user_is_admin())
    or public.current_user_can_access_carteira(carteira_id)
  )
  with check (
    (carteira_id is null and public.current_user_is_admin())
    or public.current_user_can_access_carteira(carteira_id)
  );

drop policy if exists importacao_itens_importacao_scope_all on public.importacao_itens;
create policy importacao_itens_importacao_scope_all
  on public.importacao_itens
  for all
  to authenticated
  using (public.current_user_can_access_importacao(importacao_id))
  with check (public.current_user_can_access_importacao(importacao_id));
