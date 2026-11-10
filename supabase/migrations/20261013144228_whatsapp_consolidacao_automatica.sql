begin;
-- Dispatch-time fallback also covers flows prepared by older app deployments.
create function public.whatsapp_consolidar_lote(p_lote uuid)
returns integer language plpgsql security invoker set search_path=public as $$
declare g record; m public.mensagens; ctx jsonb; body text; original text;
  variables text[]; charge_ids uuid[]; fps jsonb; total numeric; competencias text; vencimentos text;
  reduced integer:=0;
begin
  for g in
    select array_agg(x.id order by coalesce((x.payload->>'dias_atraso')::int,0) desc,x.id) ids
    from mensagens x join cobrancas c on c.id=x.cobranca_id
    where x.lote_id=p_lote and x.canal='whatsapp' and x.status in ('pendente_aprovacao','aprovada','agendada')
      and c.unidade_id is not null and x.destinatario is not null and x.provider_message_id is null
      and coalesce((x.payload->>'total_cobrancas')::int,1)=1
      and x.acordo_flow_id is null and x.pre_juridico_flow_id is null
      and not exists(select 1 from whatsapp_web_envios e where e.mensagem_id=x.id)
    group by x.carteira_id,x.cobranca_flow_id,c.unidade_id,x.status,
      case when length(regexp_replace(x.destinatario,'\D','','g')) in (10,11)
      then '55'||regexp_replace(x.destinatario,'\D','','g') else regexp_replace(x.destinatario,'\D','','g') end
    having count(*)>1
  loop
    select * into strict m from mensagens where id=g.ids[1];
    original:=m.payload->'template_resolvido'->>'conteudo';
    if original is null then raise exception 'Template original ausente; revise o lote.'; end if;
    select sum(coalesce(c.valor_atualizado,c.valor_original,0)),
      string_agg(distinct c.competencia,', ' order by c.competencia),
      string_agg(distinct x.payload->'contexto'->>'vencimento',', ' order by x.payload->'contexto'->>'vencimento'),
      array_agg(distinct x.cobranca_id order by x.cobranca_id),jsonb_agg(x.fingerprint order by x.id)
      into total,competencias,vencimentos,charge_ids,fps
      from mensagens x join cobrancas c on c.id=x.cobranca_id where x.id=any(g.ids);
    ctx:=coalesce(m.payload->'contexto','{}'::jsonb)||jsonb_build_object(
      'valor','R$'||chr(160)||translate(to_char(total,'FM999G999G999G999G990D00'),'.,',',.'),
      'valor_total','R$'||chr(160)||translate(to_char(total,'FM999G999G999G999G990D00'),'.,',',.'),
      'competencia',coalesce(competencias,''),'vencimento',coalesce(vencimentos,''));
    body:=original;
    for variables in select regexp_matches(original,'({{\s*([\w.]+)\s*}})','g') loop
      body:=replace(body,variables[1],coalesce(ctx->>variables[2],''));
    end loop;
    perform whatsapp_consolidar_unidade(p_lote,m.id,g.ids,body,m.payload||jsonb_build_object(
      'contexto',ctx,'cobranca_ids',charge_ids,'fingerprints',fps,'total_cobrancas',cardinality(g.ids),'consolidacao','whatsapp_unidade'));
    reduced:=reduced+cardinality(g.ids)-1;
  end loop;
  return reduced;
end $$;
revoke all on function public.whatsapp_consolidar_lote(uuid) from public,anon,authenticated;
grant execute on function public.whatsapp_consolidar_lote(uuid) to service_role;

do $$
declare definition text; anchor text:='if m.id is null then return null; end if;';
begin
  definition:=pg_get_functiondef('public.whatsapp_web_reservar(text,text)'::regprocedure);
  if position('perform public.whatsapp_consolidar_lote(m.lote_id)' in definition)>0 then return; end if;
  if position(anchor in definition)=0 then raise exception 'Reserva WhatsApp inesperada; revise antes de aplicar.'; end if;
  execute replace(definition,anchor,anchor||E'\n  if m.cobranca_flow_id is not null then\n    perform public.whatsapp_consolidar_lote(m.lote_id);\n    select * into strict m from public.mensagens where id=coalesce((select (payload->>''consolidada_em'')::uuid from public.mensagens where id=m.id),m.id);\n  end if;');
end $$;
commit;
