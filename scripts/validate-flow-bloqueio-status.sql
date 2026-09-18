do $outer$ begin begin execute $test$ do $body$ declare m public.mensagens; c public.cobrancas; n integer;
begin
 select msg.* into strict m from mensagens msg where msg.cobranca_flow_id is not null and msg.status='agendada' and flow_cobranca_mensagem_elegivel(msg) limit 1;
 select * into strict c from cobrancas where id=m.cobranca_id;
 update cobrancas set status='suspenso',status_operacional='suspenso' where id=c.id;
 if exists(select 1 from mensagens where id=m.id and status<>'cancelada') then raise exception 'FAIL cancellation'; end if;
 if exists(select 1 from email_agenda where mensagem_id=m.id) then raise exception 'FAIL agenda'; end if;
 if (email_reservar_disparo(m.id,'teste-interno')->>'permitido')::boolean then raise exception 'FAIL email reservation'; end if;
 if flow_cobranca_mensagem_elegivel(m) then raise exception 'FAIL eligibility'; end if;
 update cobrancas set status='em_cobranca_ativa',status_operacional='em_cobranca_ativa',automacao_bloqueada=false,status_financeiro='em_aberto' where id=c.id;
 if exists(select 1 from mensagens where id=m.id and status<>'cancelada') then raise exception 'FAIL resurrected'; end if;
 m.cobranca_flow_id:=null;
 if not flow_cobranca_mensagem_elegivel(m) then raise exception 'FAIL other flow types'; end if;
end $body$ $test$; raise exception 'TEST_ROLLBACK_OK'; exception when raise_exception then if SQLERRM <> 'TEST_ROLLBACK_OK' then raise; end if; end; end $outer$;
