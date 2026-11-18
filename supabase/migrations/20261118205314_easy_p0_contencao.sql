begin;

-- Interromper a implantação, sem alterar dados, se já houver execução incerta
-- sobreposta. O diagnóstico e a resolução pertencem à operação autorizada.
do $$
begin
  if exists (
    select 1 from public.easy_flow_execucoes
    where status in ('preview','montando','entre_partes','pronto','liberando','atencao')
    group by condominio_id having count(*) > 1
  ) then
    raise exception 'Há execuções Easy Flow conflitantes. Confira o diagnóstico P0 antes de aplicar a migration.';
  end if;
end $$;

drop index public.easy_flow_condominio_em_andamento;
create unique index easy_flow_condominio_em_andamento
  on public.easy_flow_execucoes(condominio_id)
  where status in ('preview','montando','entre_partes','pronto','liberando','atencao');

-- A rotina antiga removia a base antes das inserções do importador HTTP.
-- Não manter uma cópia executável desse caminho inseguro como fallback.
create or replace function public.easy_preparar_captacao(p_conversao uuid, p_versao text)
returns jsonb language plpgsql security invoker set search_path='' as $$
begin
  raise exception 'EASY_CAP_CONFIRMATION_PAUSED: confirmação suspensa até a substituição transacional.';
end $$;
revoke all on function public.easy_preparar_captacao(uuid,text) from public,anon,authenticated;
grant execute on function public.easy_preparar_captacao(uuid,text) to service_role;

-- Consumidores novos falham fechados enquanto a proteção no banco não existir.
create function public.easy_p0_contencao_versao()
returns integer language sql stable security invoker set search_path='' as $$ select 1 $$;
revoke all on function public.easy_p0_contencao_versao() from public,anon,authenticated;
grant execute on function public.easy_p0_contencao_versao() to service_role;

comment on function public.easy_preparar_captacao(uuid,text) is
  'Contenção P0: suspensa sem fallback destrutivo. Substituir somente pelo commit transacional Easy Cap.';
notify pgrst,'reload schema';
commit;
