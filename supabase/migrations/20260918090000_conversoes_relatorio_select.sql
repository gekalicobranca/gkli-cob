-- Permite listar os relatórios apenas no escopo de carteiras já autorizado.
create policy conversoes_relatorio_carteira_select
on public.conversoes_relatorio for select to authenticated
using (
  public.current_user_is_admin()
  or exists (
    select 1 from public.usuarios_carteiras uc
    where uc.user_id = (select auth.uid())
      and uc.carteira_id = conversoes_relatorio.carteira_id
  )
);
