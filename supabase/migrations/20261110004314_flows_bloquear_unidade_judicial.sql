begin;

create function public.flow_cobranca_mensagem_tem_unidade_judicial(m public.mensagens)
returns boolean language sql stable security invoker set search_path = '' as $$
  select case when m.acordo_id is null and m.acordo_flow_id is null and m.pre_juridico_flow_id is null
    and (m.cobranca_flow_id is not null or m.contexto = 'cobranca') then exists (
      select 1 from public.cobrancas c
      join public.unidades u on u.id = c.unidade_id
      where c.id = any(public.flow_progressao_ids(m)) and u.acao_judicial
    ) else false end;
$$;

revoke all on function public.flow_cobranca_mensagem_tem_unidade_judicial(public.mensagens)
  from public, anon, authenticated;
grant execute on function public.flow_cobranca_mensagem_tem_unidade_judicial(public.mensagens) to service_role;

-- Reaplica a conferência a mensagens consolidadas e a lotes montados antes da alteração da unidade.
do $migration$
declare
  v_src text;
  v_anchor text;
  v_guard text;
begin
  v_src := pg_get_functiondef('public.flow_cobranca_mensagem_elegivel(public.mensagens)'::regprocedure);
  v_anchor := 'select public.acordo_parcela_mensagem_elegivel(m)';
  if position(v_anchor in v_src) = 0 then raise exception 'Elegibilidade de cobrança incompatível.'; end if;
  execute replace(v_src, v_anchor, v_anchor || E'\n and not public.flow_cobranca_mensagem_tem_unidade_judicial(m)');

  v_src := pg_get_functiondef('public.maestro_flow_finalizar(uuid,uuid,text)'::regprocedure);
  v_anchor := 'select count(*) into total from mensagens where lote_id=j.lote_id;';
  if position(v_anchor in v_src) = 0 then raise exception 'Finalização do Maestro incompatível.'; end if;
  v_guard := $guard$
  if exists (
    select 1 from public.mensagens msg where msg.lote_id = j.lote_id
      and public.flow_cobranca_mensagem_tem_unidade_judicial(msg)
  ) then raise exception 'Unidade com ação judicial. Revise a montagem antes de prosseguir.'; end if;
$guard$;
  execute replace(v_src, v_anchor, v_guard || v_anchor);

  v_src := pg_get_functiondef('public.email_ativar_flow(uuid,text,uuid)'::regprocedure);
  v_anchor := 'for m in select id,canal from public.mensagens where cobranca_flow_id=p_flow';
  if position(v_anchor in v_src) = 0 then raise exception 'Ativação de flow incompatível.'; end if;
  v_guard := $guard$
  if exists (
    select 1 from public.mensagens msg where msg.cobranca_flow_id = p_flow
      and msg.status in ('pendente_aprovacao', 'aprovada', 'agendada', 'falha')
      and public.flow_cobranca_mensagem_tem_unidade_judicial(msg)
  ) then raise exception 'Unidade com ação judicial. Revise o flow antes de ativar.'; end if;
$guard$;
  execute replace(v_src, v_anchor, v_guard || v_anchor);
end;
$migration$;

comment on column public.unidades.acao_judicial is
  'Unidade com ação judicial. Impede montagem, ativação e envio de flows de cobrança; o status financeiro é mantido por cobrança.';

notify pgrst, 'reload schema';
commit;
