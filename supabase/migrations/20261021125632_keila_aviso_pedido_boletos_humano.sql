begin;
-- Dedicated authorization: a boleto handoff is not an accepted agreement.
create function public.keila_aviso_boletos_autorizado(m public.mensagens) returns boolean
language sql security invoker set search_path='' as $$
 select coalesce(m.canal='email' and m.contexto='mensageria' and m.aprovado_em is not null
 and m.destinatario='danielle.lima@gekali.com.br'
 and m.payload->'email_cc'=jsonb_build_array('edi.neves@gekali.com.br')
 and m.cobranca_flow_id is null and m.acordo_flow_id is null and m.pre_juridico_flow_id is null
 and m.payload->'aviso_formalizacao'->>'regra'='operador_gekali_boletos_v1'
 and exists(select 1 from public.central_pendencias c join public.condominios d on d.id=c.condominio_id and d.carteira_id=c.carteira_id,
 lateral jsonb_array_elements(coalesce(c.payload->'avisos_boletos','[]')) a
 where c.id::text=m.payload->>'keila_caso_id' and c.tipo='keila_atendimento' and c.carteira_id=m.carteira_id
 and c.carteira_id='e1f6e3ac-1098-4b30-9e0f-af4c47b351a3'::uuid
 and a->>'mensagem_id'=m.id::text and a->>'assunto'=m.email_assunto and a->>'texto'=m.conteudo_renderizado
 and m.id=md5('keila-boletos-v1:'||c.id::text||':'||(a->>'chave'))::uuid),false);
$$;
revoke all on function public.keila_aviso_boletos_autorizado(public.mensagens) from public,anon,authenticated;
grant execute on function public.keila_aviso_boletos_autorizado(public.mensagens) to service_role;

create function public.keila_preparar_aviso_boletos() returns trigger
language plpgsql security invoker set search_path='' as $$
declare email jsonb; chave text; mensagem uuid; assunto text; corpo text; nome text;
begin
 new.payload:=jsonb_set(new.payload,'{avisos_boletos}',case when tg_op='UPDATE' then coalesce(old.payload->'avisos_boletos','[]') else '[]'::jsonb end);
 if new.tipo<>'keila_atendimento' or new.status in ('resolvida','cancelada') or new.payload->>'estado' is distinct from 'atendimento_humano'
 or new.carteira_id is distinct from 'e1f6e3ac-1098-4b30-9e0f-af4c47b351a3'::uuid then return new; end if;
 -- Explicit boleto request, never merely an agreement requiring future boletos.
 if coalesce(new.payload->'encaminhamento_humano'->>'motivo','')<>'pedido_boletos'
 and coalesce(new.titulo,'') !~* 'bolet(o|os)' then return new; end if;
 select e into email from jsonb_array_elements(coalesce(new.payload->'emails','[]')) e order by e->>'recebido_em' desc,e->>'chave' desc limit 1;
 chave:=email->>'chave'; if coalesce(chave,'')='' then return new; end if;
 if tg_op='UPDATE' then
  if old.payload->>'estado'='atendimento_humano' and old.payload->'emails'=new.payload->'emails' then return new; end if;
  -- Never permit later edits to remove notification evidence.
  new.payload:=jsonb_set(new.payload,'{avisos_boletos}',coalesce(old.payload->'avisos_boletos','[]'));
 end if;
 if exists(select 1 from jsonb_array_elements(coalesce(new.payload->'avisos_boletos','[]')) a where a->>'chave'=chave) then return new; end if;
 select d.nome into strict nome from public.condominios d where d.id=new.condominio_id and d.carteira_id=new.carteira_id;
 mensagem:=md5('keila-boletos-v1:'||new.id::text||':'||chave)::uuid;
 assunto:='Pedido de boletos — revisão humana — '||regexp_replace(nome,E'[\r\n]',' ','g');
 corpo:='Danielle,'||E'\n\nA Keila encaminhou um pedido de boletos para atuação humana.'||E'\n\nAtendimento: '||new.titulo
 ||E'\nCondomínio: '||nome||E'\n\nRetorno recebido:\n'||coalesce(email->>'resumo','Consultar o atendimento.')
 ||E'\n\nPendência:\n'||coalesce(new.payload->>'proxima_acao','Conferir o acordo na administradora e obter os boletos atualizados.')
 ||E'\n\nConfira a grade e a situação do acordo na administradora, o vínculo do contato e os boletos antes de preparar o envio para aprovação. Este aviso não cria acordo, não confirma pagamento e não envia documentos ao morador.'
 ||E'\n\nAtendimento: https://gkli-cob.vercel.app/app/gestao/keila?caso='||new.id::text;
 new.payload:=jsonb_set(new.payload,'{avisos_boletos}',coalesce(new.payload->'avisos_boletos','[]')||jsonb_build_array(jsonb_build_object('chave',chave,'mensagem_id',mensagem,'assunto',assunto,'texto',corpo,'em',now())));
 new.payload:=jsonb_set(new.payload,'{atividades}',coalesce(new.payload->'atividades','[]')||jsonb_build_array(jsonb_build_object('em',now(),'descricao','Aviso interno de pedido de boletos encaminhado à fila para Danielle, com cópia para Edi. Mensagem: '||mensagem::text||'. Nenhum envio ao morador.','usuario_id',null)));
 return new;
end $$;
create function public.keila_enfileirar_aviso_boletos() returns trigger
language plpgsql security invoker set search_path='' as $$
declare a jsonb; inserida uuid;
begin
 for a in select value from jsonb_array_elements(coalesce(new.payload->'avisos_boletos','[]')) loop
  if tg_op='UPDATE' and exists(select 1 from jsonb_array_elements(coalesce(old.payload->'avisos_boletos','[]')) x where x->>'mensagem_id'=a->>'mensagem_id') then continue; end if;
  insert into public.mensagens(id,carteira_id,contexto,canal,status,status_operacional,destinatario,email_assunto,conteudo,conteudo_renderizado,aprovado_em,payload)
  values((a->>'mensagem_id')::uuid,new.carteira_id,'mensageria','email','aprovada','aprovada','danielle.lima@gekali.com.br',a->>'assunto',a->>'texto',a->>'texto',now(),
  jsonb_build_object('keila_caso_id',new.id,'email_cc',jsonb_build_array('edi.neves@gekali.com.br'),'aviso_formalizacao',jsonb_build_object('regra','operador_gekali_boletos_v1','tipo','pedido_boletos'))) on conflict(id) do nothing returning id into inserida;
  if inserida is not null then
   perform public.email_reservar_horario(inserida,'gekali.com.br');
   begin perform public.email_processar_avisos_internos(); exception when others then raise log 'Aviso de boletos mantido em fila para recuperação pelo cron.'; end;
  end if;
 end loop;
 return new;
end $$;
revoke all on function public.keila_preparar_aviso_boletos(),public.keila_enfileirar_aviso_boletos() from public,anon,authenticated;
create trigger keila_preparar_aviso_boletos before insert or update of payload on public.central_pendencias for each row when(new.tipo='keila_atendimento') execute function public.keila_preparar_aviso_boletos();
create trigger keila_enfileirar_aviso_boletos after insert or update of payload on public.central_pendencias for each row when(new.tipo='keila_atendimento') execute function public.keila_enfileirar_aviso_boletos();
do $migration$
declare src text;
begin
 src:=pg_get_functiondef('public.email_aviso_interno_autorizado(public.mensagens)'::regprocedure);
 if position('select public.lidia_aviso_boletos_autorizado(m)' in src)=0 then raise exception 'Âncora de autorização ausente'; end if;
 execute replace(src,'select public.lidia_aviso_boletos_autorizado(m)','select public.keila_aviso_boletos_autorizado(m) or public.lidia_aviso_boletos_autorizado(m)');
 src:=pg_get_functiondef('public.email_processar_avisos_internos()'::regprocedure);
 if position('''operador_lidia_boletos_v1''' in src)=0 then raise exception 'Âncora do worker ausente'; end if;
 execute replace(src,'''operador_lidia_boletos_v1''','''operador_lidia_boletos_v1'',''operador_gekali_boletos_v1''');
end $migration$;
notify pgrst,'reload schema';
commit;
