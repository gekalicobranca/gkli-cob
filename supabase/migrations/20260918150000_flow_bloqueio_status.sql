begin;
-- A consolidated message must remain valid for every debt in its frozen content.
create or replace function public.flow_cobranca_mensagem_elegivel(m public.mensagens)
returns boolean language sql stable security definer set search_path=public as $$
 select m.cobranca_flow_id is null or (
 m.cobranca_id is not null and exists(select 1 from cobrancas where id=m.cobranca_id)
 and not exists (
 select 1 from cobrancas c left join unidades u on u.id=c.unidade_id
 where (c.id=m.cobranca_id or coalesce(m.payload->'cobranca_ids','[]'::jsonb) @> jsonb_build_array(c.id::text))
 and (coalesce(c.status_operacional,c.status,'') <> 'em_cobranca_ativa'
 or c.status in ('possivel_acordo','acordo_firmado','acordo_efetivado','pre_juridico','judicializado','suspenso')
 or c.status_financeiro in ('quitado','renegociado') or c.automacao_bloqueada or u.acao_judicial)
 ));
$$;
create or replace function public.flow_cancelar_mensagem(p_id uuid)
returns void language plpgsql security definer set search_path=public as $$
begin
 update mensagens set status='cancelada',status_operacional='cancelada',cancelado_em=now(),
 erro='Envio cancelado: cobrança fora da cobrança ativa. Reavalie a unidade antes de montar novo flow.'
 where id=p_id and status in ('rascunho','pendente_aprovacao','aprovada','agendada','falha');
 update lote_itens set status='cancelado' where mensagem_id=p_id and status <> 'enviado';
 delete from email_agenda where mensagem_id=p_id;
 update cobranca_flows f set total_pendentes=s.pendentes,total_agendadas=s.agendadas,total_falhas=s.falhas,proximo_disparo_em=s.proximo,
 status=case when f.status in ('pausado','cancelado') then f.status when s.pendentes+s.agendadas>0 then f.status when s.falhas>0 then 'concluido_com_falhas' else 'concluido' end,
 concluido_em=case when s.pendentes+s.agendadas=0 then now() else f.concluido_em end
 from (select count(*) filter(where status in ('rascunho','pendente_aprovacao','aprovada')) pendentes,
 count(*) filter(where status='agendada') agendadas,count(*) filter(where status='falha') falhas,
 min(agendada_para) filter(where status='agendada') proximo from mensagens
 where cobranca_flow_id=(select cobranca_flow_id from mensagens where id=p_id)) s
 where f.id=(select cobranca_flow_id from mensagens where id=p_id);
end $$;
create or replace function public.flow_cancelar_apos_status_cobranca()
returns trigger language plpgsql security definer set search_path=public as $$
declare v uuid;
begin
 if coalesce(new.status_operacional,new.status,'') <> 'em_cobranca_ativa'
 or new.status in ('possivel_acordo','acordo_firmado','acordo_efetivado','pre_juridico','judicializado','suspenso')
 or new.status_financeiro in ('quitado','renegociado') or new.automacao_bloqueada then
 for v in select m.id from mensagens m left join cobrancas c on c.id=m.cobranca_id
 where m.cobranca_flow_id is not null and m.status in ('rascunho','pendente_aprovacao','aprovada','agendada','falha')
 and (m.cobranca_id=new.id or coalesce(m.payload->'cobranca_ids','[]'::jsonb) @> jsonb_build_array(new.id::text)
 or (new.unidade_id is not null and c.unidade_id=new.unidade_id and c.condominio_id=new.condominio_id))
 loop perform flow_cancelar_mensagem(v); end loop;
 end if;
 return new;
end $$;
create trigger flow_cancelar_apos_status_cobranca after update of status,status_operacional,status_financeiro,automacao_bloqueada on public.cobrancas
for each row when (old.status is distinct from new.status or old.status_operacional is distinct from new.status_operacional or old.status_financeiro is distinct from new.status_financeiro or old.automacao_bloqueada is distinct from new.automacao_bloqueada)
execute function public.flow_cancelar_apos_status_cobranca();
-- Check inside the existing atomic email and WhatsApp Web reservation functions.
do $$ declare src text; anchor text; begin
 src:=pg_get_functiondef('public.email_reservar_disparo(uuid,text)'::regprocedure);
 anchor:='select * into strict m from public.mensagens where id=p_mensagem for update;';
 if position(anchor in src)=0 then raise exception 'Email reservation anchor missing'; end if;
 execute replace(src,anchor,anchor||E'\n if not public.flow_cobranca_mensagem_elegivel(m) then perform public.flow_cancelar_mensagem(m.id); return jsonb_build_object(''permitido'',false,''motivo'',''Cobrança fora da cobrança ativa.''); end if;');
 src:=pg_get_functiondef('public.whatsapp_web_reservar(text,text)'::regprocedure);
 anchor:='if m.id is null then return null; end if;';
 if position(anchor in src)=0 then raise exception 'WhatsApp reservation anchor missing'; end if;
 execute replace(src,anchor,anchor||E'\n if not public.flow_cobranca_mensagem_elegivel(m) then perform public.flow_cancelar_mensagem(m.id); return null; end if;');
end $$;
-- Cloud workers reserve a message by advancing proxima_tentativa_em.
create or replace function public.flow_validar_claim_whatsapp()
returns trigger language plpgsql security definer set search_path=public as $$
begin
 if new.canal='whatsapp' and new.status='agendada' and new.proxima_tentativa_em is distinct from old.proxima_tentativa_em
 and not public.flow_cobranca_mensagem_elegivel(new) then
 perform public.flow_cancelar_mensagem(old.id);
 return null;
 end if;
 return new;
end $$;
create trigger flow_validar_claim_whatsapp before update on public.mensagens for each row execute function public.flow_validar_claim_whatsapp();
revoke all on function public.flow_cobranca_mensagem_elegivel(public.mensagens),public.flow_cancelar_mensagem(uuid),public.flow_cancelar_apos_status_cobranca(),public.flow_validar_claim_whatsapp() from public,anon,authenticated;
grant execute on function public.flow_cobranca_mensagem_elegivel(public.mensagens),public.flow_cancelar_mensagem(uuid) to service_role;
commit;

