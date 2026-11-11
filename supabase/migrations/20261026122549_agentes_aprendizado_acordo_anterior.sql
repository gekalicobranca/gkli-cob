begin;

-- Fase de aprendizado: histórico em qualquer status exige operação humana.
create function public.agentes_aprendizado_acordos(c public.central_pendencias) returns jsonb
language sql stable security invoker set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',a.id,'unidade_id',a.unidade_id,
  'status',a.status,'status_financeiro',a.status_financeiro,'fluxo_status',a.fluxo_status) order by a.id),'[]'::jsonb)
 from public.acordos a where a.condominio_id=c.condominio_id and exists (
  select 1 from public.unidades u where u.condominio_id=c.condominio_id and u.carteira_id=c.carteira_id
   and (u.id=c.unidade_id or coalesce(c.payload->'unidade_ids','[]'::jsonb) ? u.id::text)
   and (a.unidade_id=u.id or exists(select 1 from public.cobrancas b
    where b.unidade_id=u.id and b.condominio_id=c.condominio_id and (b.id=a.cobranca_id
     or exists(select 1 from public.acordo_cobrancas ac where ac.acordo_id=a.id and ac.cobranca_id=b.id)))));
$$;
revoke all on function public.agentes_aprendizado_acordos(public.central_pendencias) from public,anon,authenticated;
grant execute on function public.agentes_aprendizado_acordos(public.central_pendencias) to service_role;

create table public.agentes_aprendizado_encaminhamentos (
 id uuid primary key, caso_id uuid not null references public.central_pendencias(id),
 carteira_id uuid not null references public.carteiras(id), condominio_id uuid not null references public.condominios(id),
 agente text not null check(agente in ('keila','lidia')), operador_id uuid not null references public.profiles(id),
 destinatario text not null, chave text not null, mensagem_id uuid not null unique,
 acordos jsonb not null check(jsonb_typeof(acordos)='array' and jsonb_array_length(acordos)>0),
 retorno jsonb not null, resposta_sugerida text not null, assunto text not null, corpo text not null,
 created_at timestamptz not null default now(), unique(caso_id,chave),
 check((agente='keila' and destinatario='carol.stasi@gekali.com.br')
  or (agente='lidia' and destinatario='acordos.camila@genskeadvogados.com.br'))
);
create index agentes_aprendizado_carteira_idx on public.agentes_aprendizado_encaminhamentos(carteira_id);
create index agentes_aprendizado_condominio_idx on public.agentes_aprendizado_encaminhamentos(condominio_id);
create index agentes_aprendizado_operador_idx on public.agentes_aprendizado_encaminhamentos(operador_id);
alter table public.agentes_aprendizado_encaminhamentos enable row level security;
revoke all on public.agentes_aprendizado_encaminhamentos from public,anon,authenticated,service_role;
grant select,insert on public.agentes_aprendizado_encaminhamentos to service_role;
grant select on public.agentes_aprendizado_encaminhamentos to authenticated;
create policy agentes_aprendizado_leitura on public.agentes_aprendizado_encaminhamentos for select to authenticated
 using(public.current_user_can_access_carteira(carteira_id) and (operador_id=(select auth.uid())
  or exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.role in ('admin','gestor'))));

create function public.agentes_aprendizado_aviso_autorizado(m public.mensagens) returns boolean
language sql stable security invoker set search_path='' as $$
 select coalesce(m.canal='email' and m.contexto='mensageria' and m.aprovado_em is not null
 and m.cobranca_flow_id is null and m.acordo_flow_id is null and m.pre_juridico_flow_id is null
 and m.payload->'email_cc'='[]'::jsonb and not (m.payload ? 'email_bcc')
 and m.payload->'aprendizado'->>'regra'='sem_acordo_anterior_v1'
 and exists(select 1 from public.agentes_aprendizado_encaminhamentos e
  join public.central_pendencias c on c.id=e.caso_id and c.carteira_id=e.carteira_id and c.condominio_id=e.condominio_id
  where e.mensagem_id=m.id and e.caso_id::text=m.payload->>'keila_caso_id' and e.carteira_id=m.carteira_id
   and c.tipo=e.agente||'_atendimento' and e.destinatario=m.destinatario
   and m.payload->'aviso_formalizacao'->>'regra'=case e.agente when 'keila' then 'operador_gekali_boletos_v1' else 'operador_lidia_boletos_v1' end
   and e.assunto=m.email_assunto and e.corpo=m.conteudo and e.corpo=m.conteudo_renderizado
   and e.id::text=m.payload->'aprendizado'->>'encaminhamento_id'),false);
$$;

create function public.agentes_aprendizado_mensagem_elegivel(m public.mensagens) returns boolean
language plpgsql stable security invoker set search_path='' as $$
declare c public.central_pendencias; ref text;
begin
 if public.agentes_aprendizado_aviso_autorizado(m) then return true; end if;
 if m.payload->'aprendizado'->>'regra'='sem_acordo_anterior_v1' then return false; end if;
 ref:=m.payload->>'keila_caso_id';
 if ref is null and m.payload ? 'lembrete_proposta' then
  select x.payload->>'keila_caso_id' into ref from public.mensagens x
   where x.id::text=m.payload->'lembrete_proposta'->>'original_id' and x.carteira_id=m.carteira_id;
 end if;
 if ref is null then return not(coalesce(m.payload->>'agente_virtual','') in ('keila','lidia')
  or coalesce((m.payload->>'resposta_supervisionada')::boolean,false)); end if;
 select * into c from public.central_pendencias where id::text=ref and tipo in ('keila_atendimento','lidia_atendimento');
 if not found then return false; end if;
 return c.carteira_id=m.carteira_id
  and c.payload->'aprendizado'->>'regra' is distinct from 'sem_acordo_anterior_v1'
  and jsonb_array_length(public.agentes_aprendizado_acordos(c))=0;
end $$;
revoke all on function public.agentes_aprendizado_aviso_autorizado(public.mensagens),public.agentes_aprendizado_mensagem_elegivel(public.mensagens) from public,anon,authenticated;
grant execute on function public.agentes_aprendizado_aviso_autorizado(public.mensagens),public.agentes_aprendizado_mensagem_elegivel(public.mensagens) to service_role;

create function public.agentes_aprendizado_proteger_caso() returns trigger
language plpgsql security invoker set search_path='' as $$
declare historico jsonb; operadora text; destino text; operador uuid; tarefa text; rascunho text;
begin
 if new.status in ('resolvida','cancelada') then return new; end if;
 historico:=public.agentes_aprendizado_acordos(new);
 if jsonb_array_length(historico)=0 then return new; end if;
 operadora:=case new.tipo when 'keila_atendimento' then 'Carol' else 'Camila' end;
 destino:=case new.tipo when 'keila_atendimento' then 'carol.stasi@gekali.com.br' else 'acordos.camila@genskeadvogados.com.br' end;
 select id into strict operador from public.profiles where lower(email)=case new.tipo
  when 'keila_atendimento' then 'carol.stasi@gekali.com.br' else 'camila.paganini@gekali.com.br' end;
 tarefa:='Fase de aprendizado: unidade com acordo em qualquer status. Resposta organizada exclusivamente para '||operadora
  ||' ('||destino||'). Conferir histórico e retorno original. A agente não pode responder ao morador, propor ou registrar novo acordo.';
 rascunho:=coalesce(nullif(btrim(new.payload->>'resposta_simulada'),''),
  'Recebemos a solicitação referente à unidade. Há histórico de acordo que precisa ser conferido pela equipe responsável antes de qualquer orientação sobre condições, boletos ou pagamentos.');
 new.payload:=new.payload||jsonb_build_object('estado','atendimento_humano','envio_permitido',false,'proxima_acao',tarefa,
  'aprendizado',jsonb_build_object('regra','sem_acordo_anterior_v1','responsavel',operadora,'operador_id',operador,
   'destinatario',destino,'acordos',historico,'resposta_sugerida',rascunho,'envio_ao_morador',false));
 -- Impede os gatilhos antigos de gerar um segundo aviso para Danielle/Cc Edi.
 new.payload:=jsonb_set(new.payload,'{avisos_boletos}',case when tg_op='UPDATE' then coalesce(old.payload->'avisos_boletos','[]') else '[]'::jsonb end);
 if tg_op='INSERT' or old.payload->'aprendizado'->>'regra' is distinct from 'sem_acordo_anterior_v1' then
  new.payload:=jsonb_set(new.payload,'{atividades}',coalesce(new.payload->'atividades','[]')
   ||jsonb_build_array(jsonb_build_object('em',now(),'usuario_id',null,'descricao',tarefa)));
 end if;
 new.status:='em_tratamento'; new.descricao:=tarefa;
 return new;
end $$;
create trigger zz_agentes_aprendizado_proteger_caso before insert or update of payload,status,unidade_id on public.central_pendencias
 for each row when(new.tipo in ('keila_atendimento','lidia_atendimento')) execute function public.agentes_aprendizado_proteger_caso();

create function public.agentes_aprendizado_encaminhar() returns trigger
language plpgsql security invoker set search_path='' as $$
declare evento jsonb; anteriores jsonb; historico jsonb; v_chave text; mid uuid; assunto text; corpo text; nome text;
 destino text; operadora text; operador uuid; agente text; rascunho text; inserida uuid;
begin
 if new.payload->'aprendizado'->>'regra' is distinct from 'sem_acordo_anterior_v1'
  or new.status in ('resolvida','cancelada') then return new; end if;
 historico:=public.agentes_aprendizado_acordos(new);
 if jsonb_array_length(historico)=0 then return new; end if;
 -- Preserva enviados e tentativas iniciadas/incertas; não tenta retirar um envio em curso.
 update public.mensagens m set status='cancelada',status_operacional='cancelada',
  erro_envio='Fase de aprendizado: histórico de acordo exige resposta exclusiva à responsável humana.'
 where m.payload->>'keila_caso_id'=new.id::text and m.carteira_id=new.carteira_id
  and m.status in ('pendente_aprovacao','aprovada','agendada','pendente')
  and public.agentes_aprendizado_aviso_autorizado(m) is not true
  and m.enviada_em is null and m.sent_at is null
  and not exists(select 1 from public.email_tentativas t where t.mensagem_id=m.id and t.estado in ('em_envio','enviado','incerto'))
  and not exists(select 1 from public.thunderbird_envios t where t.mensagem_id=m.id and t.estado in ('enviando','enviado','incerto'));
 delete from public.email_agenda a using public.mensagens m where a.mensagem_id=m.id
  and m.payload->>'keila_caso_id'=new.id::text and m.status='cancelada';
 anteriores:=case when tg_op='UPDATE' then coalesce(old.payload->'emails','[]')||coalesce(old.payload->'retornos','[]') else '[]'::jsonb end;
 agente:=split_part(new.tipo,'_',1); destino:=new.payload->'aprendizado'->>'destinatario';
 operadora:=new.payload->'aprendizado'->>'responsavel'; operador:=(new.payload->'aprendizado'->>'operador_id')::uuid;
 rascunho:=new.payload->'aprendizado'->>'resposta_sugerida';
 select d.nome into strict nome from public.condominios d where d.id=new.condominio_id and d.carteira_id=new.carteira_id;
 for evento in select value from jsonb_array_elements(coalesce(new.payload->'emails','[]')||coalesce(new.payload->'retornos','[]')) e
  where nullif(e->>'chave','') is not null and not exists(select 1 from jsonb_array_elements(anteriores) a
   where a->>'chave'=e->>'chave' and (a->>'recebido_em') is not distinct from (e->>'recebido_em'))
  union all
  select jsonb_build_object('chave','acordo-firmado:'||(a->>'id'),'resumo',
   'Primeiro acordo firmado no app após aceite. Conferir condições, formalizar na administradora e obter termo e boletos. Acordo firmado não comprova pagamento.')
  from jsonb_array_elements(coalesce(new.payload->'acordos','[]')) a
  where a->>'etapa'='acordo_firmado' and exists(select 1 from jsonb_array_elements(historico) h where h->>'id'=a->>'id')
   and not exists(select 1 from jsonb_array_elements(case when tg_op='UPDATE' then coalesce(old.payload->'acordos','[]') else '[]'::jsonb end) x
    where x->>'id'=a->>'id' and x->>'etapa' in ('acordo_firmado','acordo_efetivado')) loop
  v_chave:=(evento->>'chave')||':'||coalesce(evento->>'recebido_em','');
  mid:=md5('aprendizado-sem-acordo-v1:'||new.id::text||':'||v_chave)::uuid;
  assunto:='Revisão de resposta — histórico de acordo — '||regexp_replace(nome,E'[\r\n]',' ','g');
  corpo:=operadora||E',\n\n'||initcap(agente)||' organizou este retorno para sua revisão exclusiva durante a fase de aprendizado.'
   ||E'\nCondomínio: '||nome||E'\nAtendimento: '||new.titulo
   ||E'\n\nRetorno recebido:\n'||coalesce(evento->>'resumo','Consultar a mensagem original.')
   ||E'\nReferência: '||coalesce(evento->>'webmail_url',evento->>'mensagem_id',evento->>'chave')
   ||E'\n\nAcordos encontrados (todos os status):\n'||historico::text
   ||E'\n\nRascunho para avaliação humana, sem envio ao morador:\n'||rascunho
   ||E'\n\nConfira a identidade, o histórico, as condições e os documentos antes de decidir a resposta. O rascunho não comprova pagamento nem autoriza novo acordo.'
   ||E'\nAtendimento: https://gkli-cob.vercel.app/app/gestao/'||agente||'?caso='||new.id::text;
  insert into public.agentes_aprendizado_encaminhamentos(id,caso_id,carteira_id,condominio_id,agente,operador_id,destinatario,chave,mensagem_id,acordos,retorno,resposta_sugerida,assunto,corpo)
   values(mid,new.id,new.carteira_id,new.condominio_id,agente,operador,destino,v_chave,mid,historico,evento,rascunho,assunto,corpo)
   on conflict(caso_id,chave) do nothing returning id into inserida;
  if inserida is null then continue; end if;
  insert into public.mensagens(id,carteira_id,contexto,canal,status,status_operacional,destinatario,email_assunto,conteudo,conteudo_renderizado,aprovado_em,payload)
   values(mid,new.carteira_id,'mensageria','email','aprovada','aprovada',destino,assunto,corpo,corpo,now(),
    jsonb_build_object('keila_caso_id',new.id,'email_cc','[]'::jsonb,
     'aprendizado',jsonb_build_object('regra','sem_acordo_anterior_v1','encaminhamento_id',mid),
     'aviso_formalizacao',jsonb_build_object('regra',case agente when 'keila' then 'operador_gekali_boletos_v1' else 'operador_lidia_boletos_v1' end,'tipo','revisao_aprendizado')));
  begin
   perform public.email_reservar_horario(mid,case agente when 'keila' then 'gekali.com.br' else 'genskeadvogados.com.br' end);
   begin perform public.email_processar_avisos_internos(); exception when others then
    raise log 'Revisão de aprendizado mantida em fila para recuperação.'; end;
  exception when others then
   update public.mensagens set status='falha',status_operacional='falha',erro_envio='Falha ao agendar revisão interna: '||left(sqlerrm,300) where id=mid;
  end;
 end loop;
 return new;
end $$;
create trigger zz_agentes_aprendizado_encaminhar after insert or update of payload,status,unidade_id on public.central_pendencias
 for each row when(new.tipo in ('keila_atendimento','lidia_atendimento')) execute function public.agentes_aprendizado_encaminhar();

create function public.agentes_aprendizado_proteger_mensagem() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
 if new.status in ('pendente_aprovacao','aprovada','agendada','pendente','em_envio','enviando')
  and public.agentes_aprendizado_mensagem_elegivel(new) is not true then
  raise exception 'Fase de aprendizado: unidade com histórico de acordo. Resposta exclusiva para Carol (Keila) ou Camila (Lidia), sem envio ao morador.';
 end if;
 return new;
end $$;
create trigger zz_agentes_aprendizado_proteger_mensagem before insert or update of status,payload,destinatario,email_assunto,conteudo,conteudo_renderizado on public.mensagens
 for each row execute function public.agentes_aprendizado_proteger_mensagem();

-- Atualiza a restrição quando outro fluxo cria um acordo, sem disparo retroativo.
create function public.agentes_aprendizado_reavaliar_acordo() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
 update public.central_pendencias c set payload=c.payload,updated_at=now()
 where c.tipo in ('keila_atendimento','lidia_atendimento') and c.condominio_id=new.condominio_id
  and c.status not in ('resolvida','cancelada') and exists(select 1 from jsonb_array_elements(public.agentes_aprendizado_acordos(c)) a where a->>'id'=new.id::text);
 return new;
end $$;
create trigger agentes_aprendizado_reavaliar_acordo after insert or update of unidade_id,cobranca_id on public.acordos
 for each row execute function public.agentes_aprendizado_reavaliar_acordo();

revoke all on function public.agentes_aprendizado_proteger_caso(),public.agentes_aprendizado_encaminhar(),
 public.agentes_aprendizado_proteger_mensagem(),public.agentes_aprendizado_reavaliar_acordo() from public,anon,authenticated;

do $migration$
declare src text; ancora text;
begin
 -- Rechecagem real no SMTP e Thunderbird, inclusive respostas sem proposta financeira.
 src:=pg_get_functiondef('public.agente_proposta_mensagem_elegivel(public.mensagens)'::regprocedure);
 ancora:='if m.payload ? ''lembrete_proposta'' then';
 if position(ancora in src)=0 then raise exception 'Âncora de elegibilidade ausente'; end if;
 execute replace(src,ancora,'if public.agentes_aprendizado_mensagem_elegivel(m) is not true then return false; end if; '||ancora);
 src:=pg_get_functiondef('public.keila_whatsapp_elegivel(public.mensagens)'::regprocedure);
 ancora:='select exists(';
 if position(ancora in src)=0 then raise exception 'Âncora de WhatsApp ausente'; end if;
 execute replace(src,ancora,'select public.agentes_aprendizado_mensagem_elegivel(m) and exists(');
 -- As tags já suportadas pelo dispatcher preservam transporte, cotas e recuperação.
 -- A nova autorização usa prova imutável própria; a tag sozinha nunca autoriza envio.
 src:=pg_get_functiondef('public.email_aviso_interno_autorizado(public.mensagens)'::regprocedure);
 ancora:='select public.keila_aviso_boletos_autorizado(m)';
 if position(ancora in src)=0 then raise exception 'Âncora de aviso interno ausente'; end if;
 src:=replace(src,ancora,'select public.agentes_aprendizado_aviso_autorizado(m) or public.agentes_aprendizado_mensagem_elegivel(m) and (public.keila_aviso_boletos_autorizado(m)');
 src:=replace(src,'false);','false));'); execute src;
 -- Nenhuma operação de proposta ou aceite pode ignorar histórico encerrado.
 src:=pg_get_functiondef('public.agente_virtual_negociar_acordo(text,uuid,uuid,text,jsonb,text)'::regprocedure);
 ancora:='propostas:=coalesce(caso.payload->''acordos'',''[]''::jsonb);';
 if position(ancora in src)=0 then raise exception 'Âncora de negociação ausente'; end if;
 execute replace(src,ancora,'if jsonb_array_length(public.agentes_aprendizado_acordos(caso))>0 then raise exception ''Fase de aprendizado: histórico de acordo em qualquer status exige revisão de Carol (Keila) ou Camila (Lidia).''; end if; '||ancora);
 -- Suprime os avisos antigos apenas para unidades abrangidas pela regra nova.
 foreach ancora in array array['keila_preparar_aviso_boletos','lidia_preparar_aviso_boletos','agente_virtual_avisar_operador'] loop
  src:=pg_get_functiondef(('public.'||ancora||'()')::regprocedure);
  if position('begin' in src)=0 then raise exception 'Âncora de gatilho ausente'; end if;
  execute overlay(src placing 'begin if jsonb_array_length(public.agentes_aprendizado_acordos(new))>0 then return new; end if;' from position('begin' in src) for 5);
 end loop;
end $migration$;

-- Sem novos avisos de e-mails antigos; preserva textos, aprovações e finanças.
update public.central_pendencias c set payload=c.payload,updated_at=now()
 where c.tipo in ('keila_atendimento','lidia_atendimento') and c.status not in ('resolvida','cancelada')
 and jsonb_array_length(public.agentes_aprendizado_acordos(c))>0;

notify pgrst,'reload schema';
commit;

