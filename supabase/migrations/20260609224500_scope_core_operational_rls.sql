-- Replace broad authenticated policies on core operational tables with
-- carteira/user scoped policies.

drop policy if exists acordos_dev_authenticated_all on public.acordos;
create policy acordos_carteira_scope_all
  on public.acordos
  for all
  to authenticated
  using (public.current_user_can_access_carteira(carteira_id))
  with check (public.current_user_can_access_carteira(carteira_id));

drop policy if exists acordo_cobrancas_authenticated_all on public.acordo_cobrancas;
create policy acordo_cobrancas_acordo_scope_all
  on public.acordo_cobrancas
  for all
  to authenticated
  using (
    exists (
      select 1
      from public.acordos a
      where a.id = acordo_cobrancas.acordo_id
        and public.current_user_can_access_carteira(a.carteira_id)
    )
  )
  with check (
    exists (
      select 1
      from public.acordos a
      where a.id = acordo_cobrancas.acordo_id
        and public.current_user_can_access_carteira(a.carteira_id)
    )
  );

drop policy if exists acordos_termos_authenticated_all on public.acordos_termos;
create policy acordos_termos_carteira_scope_all
  on public.acordos_termos
  for all
  to authenticated
  using (public.current_user_can_access_carteira(carteira_id))
  with check (public.current_user_can_access_carteira(carteira_id));

drop policy if exists acordos_aceites_authenticated_all on public.acordos_aceites;
create policy acordos_aceites_acordo_scope_all
  on public.acordos_aceites
  for all
  to authenticated
  using (
    exists (
      select 1
      from public.acordos a
      where a.id = acordos_aceites.acordo_id
        and public.current_user_can_access_carteira(a.carteira_id)
    )
  )
  with check (
    exists (
      select 1
      from public.acordos a
      where a.id = acordos_aceites.acordo_id
        and public.current_user_can_access_carteira(a.carteira_id)
    )
  );

drop policy if exists parcelas_acordo_dev_authenticated_all on public.parcelas_acordo;
create policy parcelas_acordo_acordo_scope_all
  on public.parcelas_acordo
  for all
  to authenticated
  using (
    exists (
      select 1
      from public.acordos a
      where a.id = parcelas_acordo.acordo_id
        and public.current_user_can_access_carteira(a.carteira_id)
    )
  )
  with check (
    exists (
      select 1
      from public.acordos a
      where a.id = parcelas_acordo.acordo_id
        and public.current_user_can_access_carteira(a.carteira_id)
    )
  );

drop policy if exists mensagens_authenticated_all on public.mensagens;
create policy mensagens_carteira_scope_all
  on public.mensagens
  for all
  to authenticated
  using (public.current_user_can_access_carteira(carteira_id))
  with check (public.current_user_can_access_carteira(carteira_id));

drop policy if exists lotes_dev_authenticated_all on public.lotes;
create policy lotes_carteira_scope_all
  on public.lotes
  for all
  to authenticated
  using (public.current_user_can_access_carteira(carteira_id))
  with check (public.current_user_can_access_carteira(carteira_id));

drop policy if exists lote_itens_dev_authenticated_all on public.lote_itens;
create policy lote_itens_lote_scope_all
  on public.lote_itens
  for all
  to authenticated
  using (
    exists (
      select 1
      from public.lotes l
      where l.id = lote_itens.lote_id
        and public.current_user_can_access_carteira(l.carteira_id)
    )
    or exists (
      select 1
      from public.cobrancas c
      where c.id = lote_itens.cobranca_id
        and public.current_user_can_access_carteira(c.carteira_id)
    )
    or exists (
      select 1
      from public.acordos a
      where a.id = lote_itens.acordo_id
        and public.current_user_can_access_carteira(a.carteira_id)
    )
  )
  with check (
    exists (
      select 1
      from public.lotes l
      where l.id = lote_itens.lote_id
        and public.current_user_can_access_carteira(l.carteira_id)
    )
    or exists (
      select 1
      from public.cobrancas c
      where c.id = lote_itens.cobranca_id
        and public.current_user_can_access_carteira(c.carteira_id)
    )
    or exists (
      select 1
      from public.acordos a
      where a.id = lote_itens.acordo_id
        and public.current_user_can_access_carteira(a.carteira_id)
    )
  );

drop policy if exists lote_administradora_itens_authenticated_all on public.lote_administradora_itens;
create policy lote_administradora_itens_condominio_scope_all
  on public.lote_administradora_itens
  for all
  to authenticated
  using (
    exists (
      select 1
      from public.condominios c
      where c.id = lote_administradora_itens.condominio_id
        and public.current_user_can_access_carteira(c.carteira_id)
    )
  )
  with check (
    exists (
      select 1
      from public.condominios c
      where c.id = lote_administradora_itens.condominio_id
        and public.current_user_can_access_carteira(c.carteira_id)
    )
  );

drop policy if exists audit_logs_dev_authenticated_all on public.audit_logs;
create policy audit_logs_admin_or_own_select
  on public.audit_logs
  for select
  to authenticated
  using (user_id = (select auth.uid()) or public.current_user_is_admin());

create policy audit_logs_authenticated_insert
  on public.audit_logs
  for insert
  to authenticated
  with check (user_id = (select auth.uid()) or public.current_user_is_admin());

drop policy if exists carteiras_dev_authenticated_all on public.carteiras;
create policy carteiras_authenticated_select
  on public.carteiras
  for select
  to authenticated
  using (
    public.current_user_is_admin()
    or exists (
      select 1
      from public.usuarios_carteiras uc
      where uc.user_id = (select auth.uid())
        and uc.carteira_id = carteiras.id
    )
  );

create policy carteiras_admin_insert
  on public.carteiras
  for insert
  to authenticated
  with check (public.current_user_is_admin());

create policy carteiras_admin_update
  on public.carteiras
  for update
  to authenticated
  using (public.current_user_is_admin())
  with check (public.current_user_is_admin());

create policy carteiras_admin_delete
  on public.carteiras
  for delete
  to authenticated
  using (public.current_user_is_admin());

drop policy if exists profiles_dev_authenticated_all on public.profiles;
create policy profiles_admin_or_own_select
  on public.profiles
  for select
  to authenticated
  using (id = (select auth.uid()) or public.current_user_is_admin());

create policy profiles_admin_or_own_update
  on public.profiles
  for update
  to authenticated
  using (id = (select auth.uid()) or public.current_user_is_admin())
  with check (id = (select auth.uid()) or public.current_user_is_admin());

create policy profiles_admin_insert
  on public.profiles
  for insert
  to authenticated
  with check (public.current_user_is_admin());

create policy profiles_admin_delete
  on public.profiles
  for delete
  to authenticated
  using (public.current_user_is_admin());

drop policy if exists usuarios_carteiras_dev_authenticated_all on public.usuarios_carteiras;
create policy usuarios_carteiras_admin_or_own_select
  on public.usuarios_carteiras
  for select
  to authenticated
  using (user_id = (select auth.uid()) or public.current_user_is_admin());

create policy usuarios_carteiras_admin_insert
  on public.usuarios_carteiras
  for insert
  to authenticated
  with check (public.current_user_is_admin());

create policy usuarios_carteiras_admin_update
  on public.usuarios_carteiras
  for update
  to authenticated
  using (public.current_user_is_admin())
  with check (public.current_user_is_admin());

create policy usuarios_carteiras_admin_delete
  on public.usuarios_carteiras
  for delete
  to authenticated
  using (public.current_user_is_admin());
