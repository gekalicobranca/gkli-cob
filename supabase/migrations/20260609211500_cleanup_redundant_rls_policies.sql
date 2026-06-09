-- Remove development-wide policies where scoped policies already exist.
-- This keeps the carteira/importacao-based rules as the active source of truth.
drop policy if exists cobrancas_dev_authenticated_all on public.cobrancas;
drop policy if exists condominios_dev_authenticated_all on public.condominios;
drop policy if exists importacao_itens_dev_authenticated_all on public.importacao_itens;
drop policy if exists importacoes_dev_authenticated_all on public.importacoes;
drop policy if exists interacoes_dev_authenticated_all on public.interacoes;
drop policy if exists unidades_dev_authenticated_all on public.unidades;

-- Keep one legacy unrestricted mensagens policy for compatibility, but remove the duplicate.
drop policy if exists mensagens_dev_authenticated_all on public.mensagens;

-- Prefer the scoped operational audit policies over unrestricted duplicates.
drop policy if exists auditoria_eventos_insert_authenticated on public.auditoria_eventos;
drop policy if exists auditoria_eventos_select_authenticated on public.auditoria_eventos;
drop policy if exists eventos_insert on public.eventos_operacionais;
drop policy if exists eventos_select on public.eventos_operacionais;

-- Avoid recalculating auth.uid() per row in RLS predicates.
drop policy if exists ai_interacoes_select_own on public.ai_interacoes;
create policy ai_interacoes_select_own
  on public.ai_interacoes
  for select
  using ((select auth.uid()) = user_id);

drop policy if exists ai_interacoes_insert_own on public.ai_interacoes;
create policy ai_interacoes_insert_own
  on public.ai_interacoes
  for insert
  with check ((select auth.uid()) = user_id);

drop policy if exists eventos_operacionais_select_por_carteira on public.eventos_operacionais;
create policy eventos_operacionais_select_por_carteira
  on public.eventos_operacionais
  for select
  to authenticated
  using (
    carteira_id is null
    or exists (
      select 1
      from public.usuarios_carteiras uc
      where uc.user_id = (select auth.uid())
        and uc.carteira_id = eventos_operacionais.carteira_id
    )
    or exists (
      select 1
      from public.profiles p
      where p.id = (select auth.uid())
        and p.role = any (array['admin'::text, 'gestor'::text])
    )
  );

drop policy if exists eventos_operacionais_insert_autenticado on public.eventos_operacionais;
create policy eventos_operacionais_insert_autenticado
  on public.eventos_operacionais
  for insert
  to authenticated
  with check (
    carteira_id is null
    or exists (
      select 1
      from public.usuarios_carteiras uc
      where uc.user_id = (select auth.uid())
        and uc.carteira_id = eventos_operacionais.carteira_id
    )
    or exists (
      select 1
      from public.profiles p
      where p.id = (select auth.uid())
        and p.role = any (array['admin'::text, 'gestor'::text])
    )
  );

drop policy if exists auditoria_eventos_select_por_carteira on public.auditoria_eventos;
create policy auditoria_eventos_select_por_carteira
  on public.auditoria_eventos
  for select
  to authenticated
  using (
    carteira_id is null
    or exists (
      select 1
      from public.usuarios_carteiras uc
      where uc.user_id = (select auth.uid())
        and uc.carteira_id = auditoria_eventos.carteira_id
    )
    or exists (
      select 1
      from public.profiles p
      where p.id = (select auth.uid())
        and p.role = any (array['admin'::text, 'gestor'::text])
    )
  );

drop policy if exists auditoria_eventos_insert_autenticado on public.auditoria_eventos;
create policy auditoria_eventos_insert_autenticado
  on public.auditoria_eventos
  for insert
  to authenticated
  with check (
    carteira_id is null
    or exists (
      select 1
      from public.usuarios_carteiras uc
      where uc.user_id = (select auth.uid())
        and uc.carteira_id = auditoria_eventos.carteira_id
    )
    or exists (
      select 1
      from public.profiles p
      where p.id = (select auth.uid())
        and p.role = any (array['admin'::text, 'gestor'::text])
    )
  );

drop policy if exists timeline_operacional_select_por_carteira on public.timeline_operacional;
create policy timeline_operacional_select_por_carteira
  on public.timeline_operacional
  for select
  to authenticated
  using (
    carteira_id is null
    or exists (
      select 1
      from public.usuarios_carteiras uc
      where uc.user_id = (select auth.uid())
        and uc.carteira_id = timeline_operacional.carteira_id
    )
    or exists (
      select 1
      from public.profiles p
      where p.id = (select auth.uid())
        and p.role = any (array['admin'::text, 'gestor'::text])
    )
  );

drop policy if exists timeline_operacional_insert_autenticado on public.timeline_operacional;
create policy timeline_operacional_insert_autenticado
  on public.timeline_operacional
  for insert
  to authenticated
  with check (
    carteira_id is null
    or exists (
      select 1
      from public.usuarios_carteiras uc
      where uc.user_id = (select auth.uid())
        and uc.carteira_id = timeline_operacional.carteira_id
    )
    or exists (
      select 1
      from public.profiles p
      where p.id = (select auth.uid())
        and p.role = any (array['admin'::text, 'gestor'::text])
    )
  );
