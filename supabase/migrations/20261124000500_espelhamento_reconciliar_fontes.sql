begin;

-- O processo da fonte pode sobreviver à perda da reserva do espelhamento.
-- Preservar os sinais recentes e os casos com efeitos que exigem conferência.
create function public.espelhamento_reconciliar_fontes(p_espelhamento uuid default null)
returns integer language plpgsql security invoker set search_path='' set lock_timeout='5s' as $$
declare
  total integer;
begin
  with candidatas as materialized (
    select e.id, e.status anterior, s.id espelhamento_id
    from public.agente_execucoes e
    join public.easy_espelhamento_fontes f on f.execucao_id=e.id and f.receita_id=e.receita_id
    join public.easy_espelhamentos s on s.id=f.espelhamento_id
      and s.carteira_id=e.carteira_id and s.condominio_id=e.condominio_id
    where s.estado='falha' and s.concluido_em is not null
      and (p_espelhamento is null or s.id=p_espelhamento)
      and e.origem='espelhamento' and e.finalizado_em is null
      and e.status in ('pendente','em_execucao')
      and (e.status='pendente' or coalesce(e.iniciado_em,e.created_at) < now()-interval '15 minutes')
      and not exists (select 1 from public.agente_workers w where w.metadata_json->>'execucao_id'=e.id::text
        and w.ultimo_sinal_em >= now()-interval '15 minutes')
      and not exists (select 1 from public.agente_logs l where l.execucao_id=e.id and
        (l.created_at >= now()-interval '15 minutes' or l.step in ('importacao_automatica','sem_inadimplencia','concluido') or l.metadata_json ? 'conversao_id'))
      and not exists (select 1 from public.agente_arquivos a where a.execucao_id=e.id)
      and not exists (select 1 from public.maestro_flow_montagens m where m.execucao_id=e.id)
    for update of e skip locked
  ), encerradas as (
    update public.agente_execucoes e set
      status=case when c.anterior='pendente' then 'cancelada' else 'precisa_intervencao' end,
      finalizado_em=now(),erro_mensagem='O espelhamento terminou com falha e a coleta não produziu relatório.'
    from candidatas c where e.id=c.id and e.status=c.anterior
    returning e.id,e.carteira_id,e.status,e.erro_mensagem,c.anterior,c.espelhamento_id
  ), registros as (
    insert into public.agente_logs(execucao_id,nivel,step,mensagem,metadata_json)
    select id,'warning','espelhamento_fonte_encerrada',erro_mensagem,jsonb_build_object('espelhamento_id',espelhamento_id)
    from encerradas
  ), auditoria as (
    insert into public.auditoria_eventos(carteira_id,entidade_tipo,entidade_id,evento_tipo,titulo,descricao,antes,depois)
    select carteira_id,'agente_execucao',id,'espelhamento_fonte_encerrada','Encerramento da coleta do Espelhar',erro_mensagem,
      jsonb_build_object('status',anterior),jsonb_build_object('status',status,'espelhamento_id',espelhamento_id)
    from encerradas
  ) select count(*) into total from encerradas;
  return total;
end $$;

revoke all on function public.espelhamento_reconciliar_fontes(uuid) from public,anon,authenticated,service_role;
create function public.espelhamento_ao_falhar() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  perform public.espelhamento_reconciliar_fontes(new.id);
  return null;
end $$;
revoke all on function public.espelhamento_ao_falhar() from public,anon,authenticated,service_role;
create trigger espelhamento_encerrar_fontes after update of estado on public.easy_espelhamentos
  for each row when (new.estado='falha' and old.estado is distinct from new.estado)
  execute function public.espelhamento_ao_falhar();

-- Reexaminar fontes que ainda tinham atividade ou estavam travadas ao falhar o pedido.
select cron.schedule('gkli-espelhamento-reconciliar-fontes','*/10 * * * *','select public.espelhamento_reconciliar_fontes();');

do $migration$
declare
  fonte text := pg_get_functiondef('public.easy_maestro_painel(uuid[],text)'::regprocedure);
  anterior constant text := 'then ''Pedido já em andamento no Maestro.''';
  novo constant text := 'then case when e.origem=''espelhamento'' then ''Coleta vinculada ao Espelhar.'' else ''Pedido já em andamento no Maestro.'' end';
begin
  if position(anterior in fonte)=0 then raise exception 'Definição do painel incompatível'; end if;
  if position('''solicitadaEm'', e.created_at' in fonte)=0 then raise exception 'Data do pedido indisponível'; end if;
  fonte := replace(fonte,'''solicitadaEm'', e.created_at','''solicitadaEm'', e.created_at, ''finalizadaEm'', e.finalizado_em');
  fonte := replace(fonte,'''finalizadaEm'', e.finalizado_em', $campo$'finalizadaEm', e.finalizado_em,
      'fonteEmRevisao', e.origem='espelhamento' and e.status in ('pendente','em_execucao') and exists(
        select 1 from public.easy_espelhamento_fontes f join public.easy_espelhamentos s on s.id=f.espelhamento_id
        where f.execucao_id=e.id and s.estado='falha')$campo$);
  execute replace(fonte,anterior,novo);
end $migration$;
commit;
