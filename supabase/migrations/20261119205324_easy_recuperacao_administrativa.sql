begin;
alter table public.easy_flow_eventos add column operacao_id uuid;
create unique index easy_flow_eventos_operacao on public.easy_flow_eventos(operacao_id) where operacao_id is not null;

create function public.easy_flow_admin_autorizar(p_execucao uuid,p_operador uuid)
returns void language plpgsql security invoker set search_path='' as $$
begin
  if not exists(select 1 from public.profiles p join public.easy_flow_execucoes r on r.id=p_execucao where p.id=p_operador and p.role in ('admin','gestor')
    and (p.role='admin' or exists(select 1 from public.usuarios_carteiras u where u.user_id=p.id and u.carteira_id=r.carteira_id))) then
    raise exception 'Conferência administrativa indisponível.' using errcode='42501'; end if;
end $$;
create function public.easy_flow_admin_versao(p_execucao uuid) returns text language sql stable security invoker set search_path='' as $$
  select md5(jsonb_build_object('run',to_jsonb(r),
    'partes',(select jsonb_agg(to_jsonb(p)||jsonb_build_object('artefatos',public.easy_flow_artefatos(p.flow_id)) order by p.indice) from public.easy_flow_partes p where p.execucao_id=r.id),
    'mensagens',(select jsonb_agg(jsonb_build_array(m.id,m.status,m.scheduled_at,m.agendada_para,to_jsonb(m)->'sent_at',to_jsonb(m)->'enviada_em') order by m.id) from public.mensagens m where m.cobranca_flow_id=any(r.flow_ids)),
    'tentativas',(select jsonb_agg(to_jsonb(e) order by to_jsonb(e)::text) from public.email_tentativas e join public.mensagens m on m.id=e.mensagem_id where m.cobranca_flow_id=any(r.flow_ids)),
    'whatsapp',(select jsonb_agg(to_jsonb(e) order by to_jsonb(e)::text) from public.whatsapp_web_envios e join public.mensagens m on m.id=e.mensagem_id where m.cobranca_flow_id=any(r.flow_ids)))::text)
  from public.easy_flow_execucoes r where r.id=p_execucao
$$;
create function public.easy_flow_admin_conferir(p_execucao uuid,p_operador uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare r public.easy_flow_execucoes;
begin
  perform public.easy_flow_admin_autorizar(p_execucao,p_operador);
  select * into strict r from public.easy_flow_execucoes where id=p_execucao;
  return jsonb_build_object('id',r.id,'status',r.status,'protocolo',r.protocolo,'parte',r.parte,'liberadas',r.liberadas,'flows',cardinality(r.flow_ids),'versao',public.easy_flow_admin_versao(r.id));
end $$;
create function public.easy_flow_admin_reconciliar(p_execucao uuid,p_operador uuid,p_versao text,p_motivo text,p_operacao uuid)
returns jsonb language plpgsql security invoker set search_path='' set lock_timeout='5s' set statement_timeout='60s' as $$
declare r public.easy_flow_execucoes; e public.easy_flow_eventos; antes text; retorno jsonb;
begin
  if p_operacao is null or length(trim(coalesce(p_motivo,''))) not between 10 and 2000 then raise exception 'Informe o motivo da conferência (10 a 2000 caracteres).'; end if;
  perform public.easy_flow_travar();
  perform public.easy_flow_admin_autorizar(p_execucao,p_operador);
  select * into strict r from public.easy_flow_execucoes where id=p_execucao for update;
  select * into e from public.easy_flow_eventos where operacao_id=p_operacao;
  if found then
    if e.operador_id<>p_operador or e.execucao_id<>r.id or e.dados->>'versao' is distinct from p_versao or e.dados->>'motivo' is distinct from trim(p_motivo) then raise exception 'Operação pertence a outra intenção.'; end if;
    return e.dados->'resultado';
  end if;
  antes:=public.easy_flow_admin_versao(r.id);
  if p_versao is distinct from antes then raise exception 'A execução mudou. Faça nova conferência antes de reconciliar.'; end if;
  if r.protocolo<>3 then raise exception 'Execução legada sem correlação exige revisão manual; nenhum vínculo será inferido.'; end if;
  -- O núcleo só recompõe projeções por recibos; não cria mensagem, agenda,
  -- liberação ou cancelamento. O autor original continua validado pelo núcleo.
  perform public.easy_flow_reconciliar(r.id,r.criado_por);
  retorno:=public.easy_flow_admin_conferir(r.id,p_operador);
  insert into public.easy_flow_eventos(execucao_id,operador_id,evento,dados,operacao_id)
    values(r.id,p_operador,'reconciliacao_administrativa',jsonb_build_object('motivo',trim(p_motivo),'versao',antes,'resultado',retorno,'autor_original',r.criado_por),p_operacao);
  return retorno;
end $$;
revoke all on function public.easy_flow_admin_autorizar(uuid,uuid),public.easy_flow_admin_versao(uuid),public.easy_flow_admin_conferir(uuid,uuid),public.easy_flow_admin_reconciliar(uuid,uuid,text,text,uuid) from public,anon,authenticated;
grant execute on function public.easy_flow_admin_autorizar(uuid,uuid),public.easy_flow_admin_versao(uuid),public.easy_flow_admin_conferir(uuid,uuid),public.easy_flow_admin_reconciliar(uuid,uuid,text,text,uuid) to service_role;
notify pgrst,'reload schema';
commit;
