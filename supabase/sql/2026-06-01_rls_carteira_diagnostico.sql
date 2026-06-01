-- Diagnostico simples para validar RLS por carteira com usuario nao-admin.
-- Deve ser chamado autenticado como o proprio usuario testado:
--
--   select * from public.diagnostico_rls_carteira();
--
-- Como a funcao e security invoker, os counts de tabelas operacionais respeitam
-- as policies RLS aplicadas ao usuario da sessao.

create or replace function public.diagnostico_rls_carteira()
returns table (
  user_id uuid,
  is_admin boolean,
  carteiras_vinculadas bigint,
  condominios_visiveis bigint,
  unidades_visiveis bigint,
  cobrancas_visiveis bigint,
  interacoes_visiveis bigint,
  importacoes_visiveis bigint,
  importacao_itens_visiveis bigint
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    auth.uid() as user_id,
    public.current_user_is_admin() as is_admin,
    (
      select count(*)
      from public.usuarios_carteiras uc
      where uc.user_id = auth.uid()
    ) as carteiras_vinculadas,
    (select count(*) from public.condominios) as condominios_visiveis,
    (select count(*) from public.unidades) as unidades_visiveis,
    (select count(*) from public.cobrancas) as cobrancas_visiveis,
    (select count(*) from public.interacoes) as interacoes_visiveis,
    (select count(*) from public.importacoes) as importacoes_visiveis,
    (select count(*) from public.importacao_itens) as importacao_itens_visiveis;
$$;

grant execute on function public.diagnostico_rls_carteira() to authenticated;
