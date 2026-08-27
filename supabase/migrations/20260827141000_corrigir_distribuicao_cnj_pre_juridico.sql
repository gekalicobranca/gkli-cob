do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'pre_juridico_casos'
      and column_name = 'distribuicao_cnpj'
  ) and not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'pre_juridico_casos'
      and column_name = 'distribuicao_cnj'
  ) then
    alter table public.pre_juridico_casos
      rename column distribuicao_cnpj to distribuicao_cnj;
  end if;
end $$;

alter table public.pre_juridico_casos
  add column if not exists distribuicao_cnj text null;

comment on column public.pre_juridico_casos.distribuicao_cnj is
  'Número CNJ informado para confirmar a distribuição e marcar a unidade com ação judicial.';
