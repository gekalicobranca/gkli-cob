-- Reconfere a baixa registrada no app antes de autorizar cada envio de parcela.
create or replace function public.acordo_parcela_mensagem_elegivel(m public.mensagens)
returns boolean language plpgsql stable security invoker set search_path = public as $$
declare p record; etapa record; parcela text; dias integer;
begin
 parcela := coalesce(nullif(m.payload->>'parcela_id',''),nullif(m.payload#>>'{contexto,parcela_id}',''));
 if parcela is null and m.acordo_flow_id is null then return true; end if;
 if parcela is null then return false; end if;
 select pa.*, a.status acordo_status,a.status_financeiro acordo_financeiro,a.carteira_id,a.observacoes acordo_observacoes into p
 from public.parcelas_acordo pa join public.acordos a on a.id=pa.acordo_id
 where pa.id::text=parcela;
 if not found then return false; end if;
 if p.carteira_id is distinct from m.carteira_id or (m.acordo_id is not null and m.acordo_id<>p.acordo_id) then return false; end if;
 if p.data_pagamento is not null or p.status not in ('aberta','vencida') then return false; end if;
 if p.acordo_status not in ('ativo','em_dia','em_atraso') or p.acordo_financeiro='quitado' then return false; end if;
 if position('[DUPLICIDADE_ACORDO_CONCILIADA]' in coalesce(p.acordo_observacoes,''))>0 or position('[EXCLUIR_SOMA_DIVIDA_SUBSTITUICAO_PENDENTE]' in coalesce(p.acordo_observacoes,''))>0 then return false; end if;
 if p.vencimento is null then return false; end if;
 dias := (now() at time zone 'America/Sao_Paulo')::date-p.vencimento::date;
 if dias between 1 and 4 then return false; end if;
 if m.regua_etapa_id is not null then
  select delay_dias,ativo into etapa from public.regua_etapas where id=m.regua_etapa_id;
  if not found or not etapa.ativo then return false; end if;
  if etapa.delay_dias>0 then return etapa.delay_dias=5 and dias>=5; end if;
  if dias>0 then return false; end if;
 elsif dias>0 then
  -- Sem etapa identificável, não autoriza comunicar atraso.
  return false;
 end if;
 return true;
end $$;
revoke all on function public.acordo_parcela_mensagem_elegivel(public.mensagens) from public,anon,authenticated;
grant execute on function public.acordo_parcela_mensagem_elegivel(public.mensagens) to service_role;
-- Mantém a autorização de cobrança existente e acrescenta a autorização de parcela.
do $$
declare definicao text;
begin
 select pg_get_functiondef('public.flow_cobranca_mensagem_elegivel(public.mensagens)'::regprocedure) into definicao;
 if position('acordo_parcela_mensagem_elegivel' in definicao)=0 then
  if position('select not public.mensagem_contem_cobranca_arquivada(m)' in definicao)=0 then raise exception 'Autorização existente mudou; revisar integração'; end if;
  definicao := replace(definicao,'select not public.mensagem_contem_cobranca_arquivada(m)','select public.acordo_parcela_mensagem_elegivel(m) and not public.mensagem_contem_cobranca_arquivada(m)');
  execute definicao;
 end if;
end $$;
comment on function public.acordo_parcela_mensagem_elegivel(public.mensagens) is 'Confere a baixa/status atuais do app. Sem aviso de atraso em D+1 a D+4; atraso exige etapa D+5 e parcela em aberto. Não ativa disparos.';
