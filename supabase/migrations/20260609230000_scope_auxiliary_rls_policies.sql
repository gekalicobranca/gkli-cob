-- Scope auxiliary modules that still had permissive public policies.

drop policy if exists agente_administradoras_select on public.agente_administradoras;
drop policy if exists agente_administradoras_insert on public.agente_administradoras;
drop policy if exists agente_administradoras_update on public.agente_administradoras;
create policy agente_administradoras_carteira_select
  on public.agente_administradoras
  for select
  to authenticated
  using (public.current_user_can_access_carteira(carteira_id));
create policy agente_administradoras_carteira_insert
  on public.agente_administradoras
  for insert
  to authenticated
  with check (public.current_user_can_access_carteira(carteira_id));
create policy agente_administradoras_carteira_update
  on public.agente_administradoras
  for update
  to authenticated
  using (public.current_user_can_access_carteira(carteira_id))
  with check (public.current_user_can_access_carteira(carteira_id));

drop policy if exists agente_receitas_select on public.agente_receitas;
drop policy if exists agente_receitas_insert on public.agente_receitas;
drop policy if exists agente_receitas_update on public.agente_receitas;
create policy agente_receitas_carteira_select
  on public.agente_receitas
  for select
  to authenticated
  using (public.current_user_can_access_carteira(carteira_id));
create policy agente_receitas_carteira_insert
  on public.agente_receitas
  for insert
  to authenticated
  with check (public.current_user_can_access_carteira(carteira_id));
create policy agente_receitas_carteira_update
  on public.agente_receitas
  for update
  to authenticated
  using (public.current_user_can_access_carteira(carteira_id))
  with check (public.current_user_can_access_carteira(carteira_id));

drop policy if exists agente_execucoes_select on public.agente_execucoes;
drop policy if exists agente_execucoes_insert on public.agente_execucoes;
drop policy if exists agente_execucoes_update on public.agente_execucoes;
create policy agente_execucoes_carteira_select
  on public.agente_execucoes
  for select
  to authenticated
  using (public.current_user_can_access_carteira(carteira_id));
create policy agente_execucoes_carteira_insert
  on public.agente_execucoes
  for insert
  to authenticated
  with check (public.current_user_can_access_carteira(carteira_id));
create policy agente_execucoes_carteira_update
  on public.agente_execucoes
  for update
  to authenticated
  using (public.current_user_can_access_carteira(carteira_id))
  with check (public.current_user_can_access_carteira(carteira_id));

drop policy if exists agente_credenciais_select on public.agente_credenciais;
drop policy if exists agente_credenciais_insert on public.agente_credenciais;
drop policy if exists agente_credenciais_update on public.agente_credenciais;
create policy agente_credenciais_administradora_scope_select
  on public.agente_credenciais
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.agente_administradoras aa
      where aa.id = agente_credenciais.administradora_id
        and public.current_user_can_access_carteira(aa.carteira_id)
    )
  );
create policy agente_credenciais_administradora_scope_insert
  on public.agente_credenciais
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.agente_administradoras aa
      where aa.id = agente_credenciais.administradora_id
        and public.current_user_can_access_carteira(aa.carteira_id)
    )
  );
create policy agente_credenciais_administradora_scope_update
  on public.agente_credenciais
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.agente_administradoras aa
      where aa.id = agente_credenciais.administradora_id
        and public.current_user_can_access_carteira(aa.carteira_id)
    )
  )
  with check (
    exists (
      select 1
      from public.agente_administradoras aa
      where aa.id = agente_credenciais.administradora_id
        and public.current_user_can_access_carteira(aa.carteira_id)
    )
  );

drop policy if exists agente_arquivos_select on public.agente_arquivos;
drop policy if exists agente_arquivos_insert on public.agente_arquivos;
drop policy if exists agente_arquivos_update on public.agente_arquivos;
create policy agente_arquivos_execucao_scope_select
  on public.agente_arquivos
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.agente_execucoes ae
      where ae.id = agente_arquivos.execucao_id
        and public.current_user_can_access_carteira(ae.carteira_id)
    )
  );
create policy agente_arquivos_execucao_scope_insert
  on public.agente_arquivos
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.agente_execucoes ae
      where ae.id = agente_arquivos.execucao_id
        and public.current_user_can_access_carteira(ae.carteira_id)
    )
  );
create policy agente_arquivos_execucao_scope_update
  on public.agente_arquivos
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.agente_execucoes ae
      where ae.id = agente_arquivos.execucao_id
        and public.current_user_can_access_carteira(ae.carteira_id)
    )
  )
  with check (
    exists (
      select 1
      from public.agente_execucoes ae
      where ae.id = agente_arquivos.execucao_id
        and public.current_user_can_access_carteira(ae.carteira_id)
    )
  );

drop policy if exists agente_logs_select on public.agente_logs;
drop policy if exists agente_logs_insert on public.agente_logs;
create policy agente_logs_execucao_scope_select
  on public.agente_logs
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.agente_execucoes ae
      where ae.id = agente_logs.execucao_id
        and public.current_user_can_access_carteira(ae.carteira_id)
    )
  );
create policy agente_logs_execucao_scope_insert
  on public.agente_logs
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.agente_execucoes ae
      where ae.id = agente_logs.execucao_id
        and public.current_user_can_access_carteira(ae.carteira_id)
    )
  );

drop policy if exists agente_validacoes_select on public.agente_validacoes;
drop policy if exists agente_validacoes_insert on public.agente_validacoes;
drop policy if exists agente_validacoes_update on public.agente_validacoes;
create policy agente_validacoes_execucao_scope_select
  on public.agente_validacoes
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.agente_execucoes ae
      where ae.id = agente_validacoes.execucao_id
        and public.current_user_can_access_carteira(ae.carteira_id)
    )
  );
create policy agente_validacoes_execucao_scope_insert
  on public.agente_validacoes
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.agente_execucoes ae
      where ae.id = agente_validacoes.execucao_id
        and public.current_user_can_access_carteira(ae.carteira_id)
    )
  );
create policy agente_validacoes_execucao_scope_update
  on public.agente_validacoes
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.agente_execucoes ae
      where ae.id = agente_validacoes.execucao_id
        and public.current_user_can_access_carteira(ae.carteira_id)
    )
  )
  with check (
    exists (
      select 1
      from public.agente_execucoes ae
      where ae.id = agente_validacoes.execucao_id
        and public.current_user_can_access_carteira(ae.carteira_id)
    )
  );

drop policy if exists automacoes_select on public.automacoes;
drop policy if exists automacoes_insert on public.automacoes;
create policy automacoes_carteira_select
  on public.automacoes
  for select
  to authenticated
  using (public.current_user_can_access_carteira(carteira_id));
create policy automacoes_carteira_insert
  on public.automacoes
  for insert
  to authenticated
  with check (public.current_user_can_access_carteira(carteira_id));

drop policy if exists jobs_select on public.jobs_operacionais;
drop policy if exists jobs_insert on public.jobs_operacionais;
create policy jobs_operacionais_admin_select
  on public.jobs_operacionais
  for select
  to authenticated
  using (public.current_user_is_admin());
create policy jobs_operacionais_admin_insert
  on public.jobs_operacionais
  for insert
  to authenticated
  with check (public.current_user_is_admin());

drop policy if exists portal_sindico_condominios_select on public.portal_sindico_condominios;
drop policy if exists portal_sindico_condominios_insert on public.portal_sindico_condominios;
create policy portal_sindico_condominios_admin_select
  on public.portal_sindico_condominios
  for select
  to authenticated
  using (public.current_user_is_admin());
create policy portal_sindico_condominios_admin_insert
  on public.portal_sindico_condominios
  for insert
  to authenticated
  with check (public.current_user_is_admin());

drop policy if exists portal_sindico_sessoes_select on public.portal_sindico_sessoes;
drop policy if exists portal_sindico_sessoes_insert on public.portal_sindico_sessoes;
create policy portal_sindico_sessoes_admin_select
  on public.portal_sindico_sessoes
  for select
  to authenticated
  using (public.current_user_is_admin());
create policy portal_sindico_sessoes_admin_insert
  on public.portal_sindico_sessoes
  for insert
  to authenticated
  with check (public.current_user_is_admin());

drop policy if exists portal_sindico_usuarios_select on public.portal_sindico_usuarios;
drop policy if exists portal_sindico_usuarios_insert on public.portal_sindico_usuarios;
create policy portal_sindico_usuarios_admin_select
  on public.portal_sindico_usuarios
  for select
  to authenticated
  using (public.current_user_is_admin());
create policy portal_sindico_usuarios_admin_insert
  on public.portal_sindico_usuarios
  for insert
  to authenticated
  with check (public.current_user_is_admin());
