-- Executar após 20261015180513_email_agenda_janela_noturna.sql.
-- Não ativa flows pausados e não reaproveita tentativas enviadas/incertas.
begin;
set local lock_timeout='10s';
set local statement_timeout='120s';
select pg_advisory_xact_lock(9162026,50);
create temporary table email_remanejamento on commit drop as
 select m.id,m.carteira_id,m.cobranca_flow_id,m.acordo_flow_id,m.pre_juridico_flow_id,
 a.remetente,a.agendada_para horario_anterior,to_jsonb(m) mensagem_anterior,to_jsonb(a) reserva_anterior
 from public.mensagens m join public.email_agenda a on a.mensagem_id=m.id
 where m.canal='email' and m.status='agendada'
 and coalesce(m.cobranca_flow_id,m.acordo_flow_id,m.pre_juridico_flow_id) is not null
 and not exists(select 1 from public.email_tentativas t where t.mensagem_id=m.id and t.estado in ('em_envio','enviado','incerto'));
do $$begin
 if exists(select 1 from public.mensagens m where m.canal='email' and m.status='agendada'
  and coalesce(m.cobranca_flow_id,m.acordo_flow_id,m.pre_juridico_flow_id) is not null
  and not exists(select 1 from public.email_agenda a where a.mensagem_id=m.id)
  and not exists(select 1 from public.email_tentativas t where t.mensagem_id=m.id and t.estado in ('em_envio','enviado','incerto')))
 then raise exception 'Existem e-mails de flow sem reserva: resolver remetente antes de remanejar.'; end if;
end $$;
-- Limpa as reservas em conjunto para que os horários antigos não consumam cota.
delete from public.email_agenda where mensagem_id in(select id from email_remanejamento);
do $$declare r record; begin
 for r in select * from email_remanejamento order by horario_anterior,id loop
  perform public.email_reservar_horario(r.id,r.remetente,greatest(now(),r.horario_anterior));
 end loop;
 if exists(select 1 from public.email_agenda a join email_remanejamento reserva on reserva.id=a.mensagem_id where not public.email_janela_noturna(a.agendada_para))
 then raise exception 'Reserva fora da janela noturna.'; end if;
end $$;
update public.cobranca_flows f set proximo_disparo_em=(select min(m.agendada_para) from public.mensagens m where m.cobranca_flow_id=f.id and m.status='agendada')
 where f.status='em_execucao' and f.id in(select cobranca_flow_id from email_remanejamento);
update public.acordo_flows f set proximo_disparo_em=(select min(m.agendada_para) from public.mensagens m where m.acordo_flow_id=f.id and m.status='agendada')
 where f.status='em_execucao' and f.id in(select acordo_flow_id from email_remanejamento);
update public.pre_juridico_flows f set proximo_disparo_em=(select min(m.agendada_para) from public.mensagens m where m.pre_juridico_flow_id=f.id and m.status='agendada')
 where f.status='em_execucao' and f.id in(select pre_juridico_flow_id from email_remanejamento);
insert into public.auditoria_eventos(carteira_id,entidade_tipo,entidade_id,evento_tipo,titulo,descricao,antes,depois)
 select r.carteira_id,'flow',coalesce(r.cobranca_flow_id,r.acordo_flow_id,r.pre_juridico_flow_id),
 'email.agenda_remanejada_noturna','Agenda de e-mail remanejada para 22h–06h',
 'Solicitação do operador: reduzir carga diurna. Mantidos cotas, espaçamento, aprovação e bloqueios judiciais.',
 jsonb_agg(jsonb_build_object('mensagem',r.mensagem_anterior,'reserva',r.reserva_anterior)),
 jsonb_agg(jsonb_build_object('mensagem_id',r.id,'agendada_para',a.agendada_para,'remetente',a.remetente))
 from email_remanejamento r join public.email_agenda a on a.mensagem_id=r.id
 group by r.carteira_id,coalesce(r.cobranca_flow_id,r.acordo_flow_id,r.pre_juridico_flow_id);
select count(*) emails,count(distinct coalesce(r.cobranca_flow_id,r.acordo_flow_id,r.pre_juridico_flow_id)) flows,
 min(a.agendada_para) primeiro,max(a.agendada_para) ultimo from email_remanejamento r join public.email_agenda a on a.mensagem_id=r.id;
commit;
