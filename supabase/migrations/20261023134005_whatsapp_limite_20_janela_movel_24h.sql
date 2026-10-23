begin;

-- Quota compartilhada pelo número, inclusive entre carteiras e sessões.
-- Confirmações tardias e envios incertos continuam consumindo a janela.
create index if not exists whatsapp_web_envios_numero_janela_24h_idx
  on public.whatsapp_web_envios (numero, greatest(iniciado_em, finalizado_em));

do $$
declare
  definition text;
  old_clause text := 'where numero=p_numero and (estado in (''reservado'',''enviado'',''incerto'') or jsonb_array_length(recibos)>0) and (iniciado_em at time zone ''America/Sao_Paulo'')::date=(now() at time zone ''America/Sao_Paulo'')::date) >= 50';
  new_clause text := 'where numero=p_numero and (estado in (''reservado'',''enviado'',''incerto'') or jsonb_array_length(recibos)>0) and greatest(iniciado_em,finalizado_em)>now()-interval ''24 hours'') >= 20';
  old_order text := 'order by msg.agendada_para,msg.id for update of msg skip locked limit 1';
  new_order text := 'order by case when (msg.payload->''destinatario_regua'') ? ''email'' then nullif(btrim(msg.payload#>>''{destinatario_regua,email}''),'''') is null else false end desc, msg.agendada_para,msg.id for update of msg skip locked limit 1';
begin
  definition := pg_get_functiondef('public.whatsapp_web_reservar(text,text)'::regprocedure);
  if position(new_clause in definition)>0 and position(new_order in definition)>0 then return; end if;
  if position(old_clause in definition)=0 or position(old_order in definition)=0 then
    raise exception 'Regra de limite WhatsApp inesperada; revise antes de aplicar';
  end if;
  execute replace(replace(definition, old_clause, new_clause), old_order, new_order);
end $$;

comment on function public.whatsapp_web_reservar(text,text) is
  'Reserva WhatsApp: máximo de 20 mensagens por número nas últimas 24 horas, incluindo atrasadas, sem reset à meia-noite. Prioriza responsáveis sem e-mail; preserva horário, cadência e flows pausados.';

commit;
