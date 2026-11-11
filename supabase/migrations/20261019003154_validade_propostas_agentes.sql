begin;
-- New policy-marked proposals only: historical approvals/messages are untouched.
create or replace function public.agente_proposta_pode_lembrar(p_original uuid, p_agora timestamptz default clock_timestamp())
returns boolean language sql stable security invoker set search_path='' as $$
 select exists (
  select 1 from public.mensagens m
  join public.central_pendencias c on c.id::text=m.payload->>'keila_caso_id' and c.carteira_id=m.carteira_id
  where m.id=p_original and m.canal='email' and m.status='enviada' and m.enviada_em is not null
   and m.payload->'proposta_validade'->>'regra'='sete_dias_v1'
   and c.tipo in ('keila_atendimento','lidia_atendimento') and c.status not in ('resolvida','cancelada')
   and c.payload->>'estado'='aguardando_retorno'
   and c.payload->'resposta_aprovada'->>'mensagem_id'=m.id::text
   and c.payload->'resposta_aprovada'->>'texto'=coalesce(m.conteudo_renderizado,m.conteudo)
   and c.payload->'conferencia_proposta'->>'hash'=m.payload->'proposta_validade'->>'hash'
   and c.payload->>'resposta_email_chave'=m.payload->'proposta_validade'->>'email_chave'
   and (p_agora at time zone 'America/Sao_Paulo')::date=((m.enviada_em+interval '7 days') at time zone 'America/Sao_Paulo')::date-1
   and p_agora<m.enviada_em+interval '7 days'
   and (m.payload->'proposta_validade'->>'primeiro_vencimento')::date >= (p_agora at time zone 'America/Sao_Paulo')::date
   and not public.email_destino_invalido(m.carteira_id,m.destinatario)
   and jsonb_array_length(coalesce(c.payload->'unidade_ids','[]'))=1
   and exists(select 1 from public.unidades u where u.id::text=c.payload->'unidade_ids'->>0
      and u.carteira_id=c.carteira_id and u.condominio_id=c.condominio_id and u.acao_judicial is not true
      and lower(trim(u.email))=lower(trim(m.destinatario)))
   and not exists(select 1 from jsonb_array_elements(coalesce(c.payload->'emails','[]')) e
     where e->>'chave' is distinct from m.payload->'proposta_validade'->>'email_chave'
       and (e->>'recebido_em')::timestamptz >= (c.payload->'resposta_aprovada'->>'em')::timestamptz)
   and not exists(select 1 from jsonb_array_elements(coalesce(c.payload->'retornos','[]')) e
     where (e->>'recebido_em')::timestamptz >= (c.payload->'resposta_aprovada'->>'em')::timestamptz)
   and not exists(select 1 from jsonb_array_elements(coalesce(c.payload->'acordos','[]')) a where a->>'etapa' in ('acordo_firmado','acordo_efetivado'))
   and not exists(select 1 from public.acordos a where a.unidade_id::text=c.payload->'unidade_ids'->>0 and a.carteira_id=c.carteira_id
      and a.status not in ('cancelado','quebrado','renegociado'))
   and not exists(select 1 from jsonb_array_elements(c.payload->'conferencia_proposta'->'plano'->'incluidas') i
      left join public.cobrancas b on b.id::text=i->>'cobranca_id' and b.carteira_id=c.carteira_id
      where b.id is null or b.duplicada_de_id is not null or b.status_financeiro is distinct from 'em_aberto'
        or b.automacao_bloqueada is true or b.status_operacional in ('suspenso','judicializado','pre_juridico','acordo_firmado','acordo_efetivado'))
 );
$$;

create or replace function public.agente_proposta_mensagem_elegivel(m public.mensagens)
returns boolean language plpgsql stable security invoker set search_path='' as $$
declare original public.mensagens; c public.central_pendencias;
begin
 if m.payload ? 'lembrete_proposta' then
  select * into original from public.mensagens where id::text=m.payload->'lembrete_proposta'->>'original_id' and carteira_id=m.carteira_id;
  if not found then return false; end if;
  return public.agente_proposta_pode_lembrar(original.id)
   and m.destinatario=original.destinatario
   and m.id=md5('lembrete-proposta-v1:'||original.id::text)::uuid
   and m.payload->'lembrete_proposta'->>'regra'='sete_dias_v1';
 end if;
 if m.payload->'proposta_validade'->>'regra'='sete_dias_v1' then
  select * into c from public.central_pendencias where id::text=m.payload->>'keila_caso_id' and carteira_id=m.carteira_id;
  return found and c.tipo in ('keila_atendimento','lidia_atendimento') and c.status not in ('resolvida','cancelada')
   and c.payload->>'estado' not in ('atendimento_humano','concluido')
   and c.payload->'resposta_aprovada'->>'mensagem_id'=m.id::text
   and c.payload->'resposta_aprovada'->>'texto'=coalesce(m.conteudo_renderizado,m.conteudo)
   and c.payload->'conferencia_proposta'->>'hash'=m.payload->'proposta_validade'->>'hash'
   and (m.payload->'proposta_validade'->>'primeiro_vencimento')::date >= (clock_timestamp() at time zone 'America/Sao_Paulo')::date;
 end if;
 return true;
end $$;

create index mensagens_propostas_validade_envio on public.mensagens(enviada_em,id)
where canal='email' and status='enviada' and payload->'proposta_validade'->>'regra'='sete_dias_v1';

create or replace function public.agentes_preparar_lembretes_propostas()
returns integer language plpgsql security invoker set search_path='' as $$
declare m public.mensagens; id_lembrete uuid; inserida uuid; corpo text; agente text; nome text; marca text;
 remetente text; reservado timestamptz; total integer:=0;
begin
 perform pg_advisory_xact_lock(9162026,50);
 for m in select * from public.mensagens where canal='email' and status='enviada'
  and payload->'proposta_validade'->>'regra'='sete_dias_v1'
  and enviada_em>now()-interval '8 days' and enviada_em<now()-interval '5 days' order by enviada_em,id loop
  if not public.agente_proposta_pode_lembrar(m.id) then continue; end if;
  id_lembrete:=md5('lembrete-proposta-v1:'||m.id::text)::uuid;
  if exists(select 1 from public.mensagens where id=id_lembrete) then continue; end if;
  select case when tipo='lidia_atendimento' then 'lidia' else 'keila' end into agente
   from public.central_pendencias where id::text=m.payload->>'keila_caso_id';
  nome:=case when agente='lidia' then 'Lidia' else 'Keila' end;
  marca:=case when agente='lidia' then 'Genske Advogados' else 'GEKALI' end;
  -- Reuse the original transport identity/reservation, never credentials or a new flow.
  select t.remetente into remetente from public.email_tentativas t where t.mensagem_id=m.id and t.estado='enviado' order by iniciado_em desc limit 1;
  if remetente is null then continue; end if;
  corpo:='Olá! Sua proposta vence amanhã, em '||to_char((m.enviada_em+interval '7 days') at time zone 'America/Sao_Paulo','DD/MM/YYYY "às" HH24:MI')||E' (horário de Brasília).\n\n'
   ||E'Confira as condições e o vencimento proposto no e-mail anterior. Se o vencimento à vista ou da primeira parcela já tiver passado, ou se desejar uma nova proposta, será necessário atualizar os valores e confirmar novas condições.\n\n'
   ||nome||' | '||marca;
  insert into public.mensagens(id,carteira_id,contexto,canal,status,status_operacional,destinatario,email_assunto,conteudo,conteudo_renderizado,aprovado_em,payload)
   values(id_lembrete,m.carteira_id,'mensageria','email','pendente_aprovacao','pendente_aprovacao',m.destinatario,'Sua proposta vence amanhã',corpo,corpo,now(),
    jsonb_build_object('keila_caso_id',m.payload->>'keila_caso_id','agente_virtual',agente,'lembrete_proposta',jsonb_build_object('regra','sete_dias_v1','original_id',m.id,'autorizacao','operador_autorizou_lembrete_automatico')))
   on conflict(id) do nothing returning id into inserida;
  if inserida is null then continue; end if;
  reservado:=public.email_reservar_horario(id_lembrete,remetente);
  -- A queue that spills to another day must never send an incorrect "tomorrow".
  if (reservado at time zone 'America/Sao_Paulo')::date <> (now() at time zone 'America/Sao_Paulo')::date then
   update public.mensagens set status='cancelada',status_operacional='cancelada',erro_envio='Lembrete não coube no dia da véspera; sem reenvio automático.' where id=id_lembrete;
  end if;
  total:=total+1;
 end loop;
 return total;
end $$;

-- Both SMTP and Thunderbird use this existing gate. Preserve all previous checks.
do $migration$
declare src text; anchor text;
begin
 src:=pg_get_functiondef('public.email_reservar_disparo_interno(uuid,text)'::regprocedure);
 anchor:='select * into strict m from public.mensagens where id=p_mensagem for update;';
 if position(anchor in src)=0 then raise exception 'Âncora da reserva de e-mail ausente.'; end if;
 execute replace(src,anchor,anchor||E'\n  if public.agente_proposta_mensagem_elegivel(m) is not true then update public.mensagens set status=''cancelada'',status_operacional=''cancelada'',erro_envio=''Proposta ou lembrete não está mais vigente; nova proposta necessária.'' where id=m.id and status in (''agendada'',''aprovada''); delete from public.email_agenda where mensagem_id=m.id; return jsonb_build_object(''permitido'',false,''motivo'',''Proposta ou lembrete não está mais vigente; nova proposta e aprovação necessárias.''); end if;');
 src:=pg_get_functiondef('public.thunderbird_iniciar(uuid,uuid)'::regprocedure);
 anchor:='select * into strict m from mensagens where id=e.mensagem_id for update;';
 if position(anchor in src)=0 then raise exception 'Âncora do início Thunderbird ausente.'; end if;
 execute replace(src,anchor,anchor||E'\n  if public.agente_proposta_mensagem_elegivel(m) is not true then update public.mensagens set status=''cancelada'',status_operacional=''cancelada'',erro_envio=''Proposta ou lembrete não está mais vigente; nova proposta necessária.'' where id=m.id and status in (''agendada'',''aprovada''); delete from public.email_agenda where mensagem_id=m.id; return false; end if;');
end $migration$;


-- Renewals must be freshly reconciled; RPC callers cannot bypass the current period.
do $negociacao$
declare src text; anchor text;
begin
 src:=pg_get_functiondef('public.agente_virtual_negociar_acordo(text,uuid,uuid,text,jsonb,text)'::regprocedure);
 anchor:='if p_operacao=''aceitar'' and n>1';
 if position(anchor in src)=0 then raise exception 'Âncora da negociação ausente.'; end if;
 execute replace(src,anchor,$guard$
 if p_operacao='propor' then
  if (dados->'parcelas'->0->>'vencimento')::date > (date_trunc('month',hoje)::date + case when extract(day from hoje)>10 then interval '1 month' else interval '0 month' end + interval '9 days')::date then
   raise exception 'Primeiro vencimento deve ficar no período corrente (11 a 10).';
  end if;
  if caso.payload->'conferencia_proposta'->>'validade_regra' is distinct from 'sete_dias_v1'
    or caso.payload->'conferencia_proposta'->>'data_fonte' is distinct from hoje::text
    or caso.payload->'conferencia_proposta'->>'vencimento' is distinct from dados->'parcelas'->0->>'vencimento'
    or (caso.payload->'conferencia_proposta'->>'quantidade')::integer is distinct from n
    or not exists(select 1 from public.agente_execucoes e where e.id::text=caso.payload->>'execucao_id' and e.condominio_id=caso.condominio_id
      and e.carteira_id=caso.carteira_id and e.status='sucesso' and (e.created_at at time zone 'America/Sao_Paulo')::date=hoje) then
   raise exception 'Nova proposta exige relatório de hoje e conferência atualizada das condições.';
  end if;
 elsif exists(select 1 from public.mensagens m where m.id::text=caso.payload->'resposta_aprovada'->>'mensagem_id'
   and m.carteira_id=caso.carteira_id and m.payload->'proposta_validade'->>'regra'='sete_dias_v1'
   and (m.status is distinct from 'enviada' or m.enviada_em is null or clock_timestamp()>=m.enviada_em+interval '7 days')) then
  raise exception 'Proposta sem envio confirmado ou fora da validade. Atualize os valores e obtenha nova aprovação.';
 end if;
 $guard$||anchor);
end $negociacao$;

revoke all on function public.agente_proposta_pode_lembrar(uuid,timestamptz),public.agente_proposta_mensagem_elegivel(public.mensagens),public.agentes_preparar_lembretes_propostas() from public,anon,authenticated;
grant execute on function public.agente_proposta_pode_lembrar(uuid,timestamptz),public.agente_proposta_mensagem_elegivel(public.mensagens),public.agentes_preparar_lembretes_propostas() to service_role;
-- Dedicated proposal reminder. Does not activate or create collection/agreement flows.
select cron.schedule('gkli-agentes-propostas-validade','5 3 * * *','select public.agentes_preparar_lembretes_propostas();');
notify pgrst,'reload schema';
commit;
