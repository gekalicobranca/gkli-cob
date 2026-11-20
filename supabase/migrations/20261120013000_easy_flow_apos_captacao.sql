begin;

alter table public.easy_flow_execucoes add column captacao_id uuid references public.easy_captacao_resultados(conversao_id);
create unique index easy_flow_por_captacao on public.easy_flow_execucoes(captacao_id) where captacao_id is not null;

create function public.easy_flow_iniciar_da_captacao(
  p_conversao uuid,p_operador uuid,p_condominio uuid,p_regua uuid,p_smtp uuid,
  p_plano jsonb,p_versoes jsonb,p_config text,p_resumo jsonb,p_snapshot text
) returns public.easy_flow_execucoes language plpgsql security invoker set search_path='' set lock_timeout='5s' as $$
declare
  carteira uuid;
  concluida timestamptz;
  execucao public.easy_flow_execucoes;
begin
  perform public.easy_flow_travar();
  select v.carteira_id,r.criado_em into strict carteira,concluida
    from public.easy_captacao_resultados r join public.conversoes_relatorio v on v.id=r.conversao_id
    where r.conversao_id=p_conversao and r.operador_id=p_operador and r.carteira_id=v.carteira_id
      and v.condominio_id=p_condominio and v.origem='easy_captacao' and v.status in ('concluido','concluido_com_alertas');
  perform public.easy_flow_autorizar(p_operador,carteira,p_operador);
  select * into execucao from public.easy_flow_execucoes where captacao_id=p_conversao;
  if found then
    if (execucao.resumo->>'versaoCapFlow') is distinct from (p_resumo->>'versaoCapFlow') then
      raise exception 'Confira a configuração da execução já registrada no Easy Flow.';
    end if;
    return execucao;
  end if;

  if exists(select 1 from public.easy_captacao_resultados r join public.conversoes_relatorio v on v.id=r.conversao_id
    where v.condominio_id=p_condominio and r.conversao_id<>p_conversao and r.criado_em>=concluida)
    then raise exception 'Há uma captação mais recente neste condomínio.'; end if;
  if exists(select 1 from public.easy_flow_execucoes where condominio_id=p_condominio
    and status in ('preview','montando','entre_partes','pronto','liberando','atencao'))
    then raise exception 'Confira a execução aberta no Easy Flow.'; end if;

  select * into execucao from public.easy_flow_iniciar(p_operador,p_condominio,p_regua,p_smtp,p_plano,p_versoes,p_config,p_resumo,p_snapshot);
  update public.easy_flow_execucoes set captacao_id=p_conversao where id=execucao.id returning * into execucao;
  return execucao;
end $$;

revoke all on function public.easy_flow_iniciar_da_captacao(uuid,uuid,uuid,uuid,uuid,jsonb,jsonb,text,jsonb,text) from public,anon,authenticated;
grant execute on function public.easy_flow_iniciar_da_captacao(uuid,uuid,uuid,uuid,uuid,jsonb,jsonb,text,jsonb,text) to service_role;
notify pgrst,'reload schema';
commit;
