begin;

alter table public.agente_execucoes
  add column easy_maestro_montar_flow boolean not null default false,
  add constraint agente_execucoes_easy_maestro_montar_flow
    check (not easy_maestro_montar_flow or easy_maestro_lote_id is not null);

-- Reutiliza a fila e o cálculo de disponibilidade do Easy Maestro. A escolha
-- pertence ao lote e fica gravada na mesma transação que publica os pedidos.
create function public.easy_maestro_captar(
  p_carteiras uuid[], p_administradora text, p_usuario uuid, p_lote uuid, p_montar_flow boolean
)
returns integer language plpgsql security invoker set search_path = '' as $$
declare
  criadas integer;
  montar boolean;
begin
  perform pg_advisory_xact_lock(15102026, 1912);
  select e.easy_maestro_montar_flow into montar from public.agente_execucoes e
    where e.easy_maestro_lote_id=p_lote and e.solicitado_por=p_usuario order by e.id limit 1;
  montar := coalesce(montar,p_montar_flow,false);
  criadas := public.easy_maestro_captar(p_carteiras,p_administradora,p_usuario,p_lote);
  if montar and criadas>0 then
    update public.agente_execucoes set easy_maestro_montar_flow=true
    where easy_maestro_lote_id=p_lote and solicitado_por=p_usuario and not easy_maestro_montar_flow;
  end if;
  return criadas;
end $$;

revoke all on function public.easy_maestro_captar(uuid[],text,uuid,uuid,boolean) from public,anon,authenticated;
grant execute on function public.easy_maestro_captar(uuid[],text,uuid,uuid,boolean) to service_role;

do $migration$
declare
  fonte text;
  campo_easy text := $anchor$'easy', e.easy_maestro_lote_id is not null,$anchor$;
  origem_flow text := $anchor$'origem','maestro','montagem_id',j.id$anchor$;
  origem_revisao text := $anchor$case when exists(
    select 1 from public.agente_execucoes e where e.id=j.execucao_id and e.easy_maestro_montar_flow
  ) then 'easy_maestro' else 'maestro' end$anchor$;
begin
  fonte := pg_get_functiondef('public.easy_maestro_painel(uuid[],text)'::regprocedure);
  if position(campo_easy in fonte)=0 then raise exception 'Painel Easy Maestro fora da versão esperada.'; end if;
  execute replace(fonte,campo_easy,campo_easy||$painel$
      'montarFlow', coalesce(e.easy_maestro_montar_flow,false),
      'montagemStatus', (select m.status from public.maestro_flow_montagens m
        where e.easy_maestro_montar_flow and m.execucao_id=e.id and m.conversao_id=v.id),
      'flowsMontados', (select cardinality(m.flow_ids) from public.maestro_flow_montagens m
        where e.easy_maestro_montar_flow and m.execucao_id=e.id and m.conversao_id=v.id),
$painel$);

  fonte := pg_get_functiondef('public.maestro_flow_finalizar(uuid,uuid,text)'::regprocedure);
  if position(origem_flow in fonte)=0 then
    raise exception 'Montagem Maestro fora da versão esperada.';
  end if;
  -- A fila de ativação automática aceita somente origem maestro. O Easy gera
  -- o flow pronto com mensagens pendentes de aprovação.
  fonte := replace(fonte,origem_flow,$anchor$'origem',$anchor$||origem_revisao||$anchor$,'montagem_id',j.id$anchor$);
  execute fonte;
end
$migration$;

commit;
