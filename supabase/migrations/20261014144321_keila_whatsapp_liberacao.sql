begin;

-- Serviço autenticado da tela; uma transação cria a mensagem e registra a liberação.
create function public.keila_liberar_whatsapp(p_caso uuid,p_updated_at timestamptz,p_hash text,p_usuario uuid)
returns uuid language plpgsql security invoker set search_path=public as $$
declare c public.central_pendencias; r jsonb; u public.unidades; w public.carteiras; mid uuid; em timestamptz:=now(); chave text;
begin
 select * into strict c from central_pendencias where id=p_caso and tipo='keila_atendimento' for update;
 r:=c.payload->'rascunho_whatsapp';
 if r is null or r->>'versao_hash' is distinct from p_hash or r#>>'{aprovacao,versao_hash}' is distinct from p_hash then raise exception 'Aprove a versão atual do rascunho.'; end if;
 -- Um clique repetido nunca reativa mensagem cancelada, enviada ou incerta.
 if r#>>'{liberacao,mensagem_id}' is not null then return (r#>>'{liberacao,mensagem_id}')::uuid; end if;
 if c.updated_at is distinct from p_updated_at then raise exception 'Atendimento mudou. Recarregue e revise.'; end if;
 if c.status in ('resolvida','cancelada') or c.payload->>'estado' in ('atendimento_humano','concluido') then raise exception 'Atendimento bloqueado para envio.'; end if;
 if jsonb_array_length(c.payload->'unidade_ids')<>1 then raise exception 'Confirme a unidade do contato.'; end if;
 select * into strict u from unidades where id=(c.payload->'unidade_ids'->>0)::uuid and carteira_id=c.carteira_id and condominio_id=c.condominio_id;
 if u.acao_judicial or regexp_replace(coalesce(u.telefone,''),'\D','','g') is distinct from r->>'destinatario' then raise exception 'Confira o cadastro e os bloqueios da unidade.'; end if;
 if r->>'destinatario' !~ '^55[0-9]{2}9[0-9]{8}$' or length(trim(r->>'texto')) not between 1 and 4000 then raise exception 'Destinatário ou texto inválido.'; end if;
 select * into strict w from carteiras where id=c.carteira_id;
 if not coalesce(w.whatsapp_habilitado,false) or w.whatsapp_transporte<>'web' or nullif(w.whatsapp_web_sessao,'') is null then raise exception 'Configure o transporte WhatsApp Web desta carteira para enviar texto aprovado.'; end if;
 if exists(select 1 from regua_destinatarios_bloqueados b where b.ativo and b.canal in ('whatsapp','todos') and regexp_replace(b.destinatario,'\D','','g')=r->>'destinatario') then raise exception 'Destinatário bloqueado para WhatsApp.'; end if;
 mid:=gen_random_uuid(); chave:=c.payload->'emails'->-1->>'chave';
 r:=jsonb_set(r,'{liberacao}',jsonb_build_object('em',em,'usuario_id',p_usuario,'mensagem_id',mid,'email_chave',chave));
 insert into mensagens(id,carteira_id,contexto,canal,status,status_operacional,destinatario,whatsapp_numero,conteudo,conteudo_renderizado,aprovado_por,aprovado_em,agendada_para,payload)
 values(mid,c.carteira_id,'mensageria','whatsapp','agendada','agendada',r->>'destinatario',r->>'destinatario',r->>'texto',r->>'texto',(r#>>'{aprovacao,usuario_id}')::uuid,(r#>>'{aprovacao,em}')::timestamptz,em,jsonb_build_object('keila_caso_id',c.id,'keila_whatsapp_hash',p_hash,'resposta_supervisionada',true,'liberado_por',p_usuario,'liberado_em',em));
 update central_pendencias set payload=jsonb_set(c.payload,'{rascunho_whatsapp}',r)||jsonb_build_object('proxima_acao','Acompanhar WhatsApp liberado na fila; verificar o status do transporte.','atividades',coalesce(c.payload->'atividades','[]'::jsonb)||jsonb_build_array(jsonb_build_object('em',em,'usuario_id',p_usuario,'descricao','WhatsApp aprovado liberado explicitamente na fila. Mensagem '||mid||'. Versão '||p_hash))),descricao='Acompanhar WhatsApp liberado na fila; verificar o status do transporte.',updated_at=em where id=c.id;
 return mid;
end $$;
revoke all on function public.keila_liberar_whatsapp(uuid,timestamptz,text,uuid) from public,anon,authenticated;
grant execute on function public.keila_liberar_whatsapp(uuid,timestamptz,text,uuid) to service_role;

-- Não abre a fila para mensagens avulsas: somente a versão liberada e preservada.
create function public.keila_whatsapp_elegivel(m public.mensagens)
returns boolean language sql stable security invoker set search_path=public as $$
 select exists(select 1 from central_pendencias c join carteiras w on w.id=c.carteira_id
 join unidades u on u.id=(c.payload->'unidade_ids'->>0)::uuid and u.carteira_id=c.carteira_id
 where c.id::text=m.payload->>'keila_caso_id' and c.tipo='keila_atendimento' and c.carteira_id=m.carteira_id
 and c.status not in ('resolvida','cancelada') and c.payload->>'estado' not in ('atendimento_humano','concluido')
 and w.whatsapp_habilitado and not coalesce(u.acao_judicial,false)
 and c.payload#>>'{rascunho_whatsapp,liberacao,mensagem_id}'=m.id::text
 and c.payload#>>'{rascunho_whatsapp,versao_hash}'=m.payload->>'keila_whatsapp_hash'
 and c.payload#>>'{rascunho_whatsapp,aprovacao,versao_hash}'=m.payload->>'keila_whatsapp_hash'
 and c.payload#>>'{rascunho_whatsapp,texto}'=m.conteudo_renderizado
 and c.payload#>>'{rascunho_whatsapp,destinatario}'=m.destinatario
 and regexp_replace(coalesce(u.telefone,''),'\D','','g')=m.destinatario
 and (c.payload#>>'{rascunho_whatsapp,liberacao,email_chave}') is not distinct from (c.payload->'emails'->-1->>'chave'));
$$;
revoke all on function public.keila_whatsapp_elegivel(public.mensagens) from public,anon,authenticated;
grant execute on function public.keila_whatsapp_elegivel(public.mensagens) to service_role;

create function public.keila_whatsapp_preservar_versao() returns trigger
language plpgsql security invoker set search_path=public as $$
begin
 if old.payload ? 'keila_whatsapp_hash' and (new.destinatario is distinct from old.destinatario or new.conteudo is distinct from old.conteudo or new.conteudo_renderizado is distinct from old.conteudo_renderizado or new.canal is distinct from old.canal or new.carteira_id is distinct from old.carteira_id or new.payload is distinct from old.payload) then
 raise exception 'WhatsApp liberado é imutável. Preserve o histórico e prepare nova versão para aprovação.';
 end if;
 return new;
end $$;
revoke all on function public.keila_whatsapp_preservar_versao() from public,anon,authenticated;
create trigger keila_whatsapp_preservar_versao before update on public.mensagens for each row execute function public.keila_whatsapp_preservar_versao();

do $$ declare src text; anchor text:='and (msg.cobranca_flow_id is not null or msg.acordo_flow_id is not null or msg.pre_juridico_flow_id is not null)'; begin
 src:=pg_get_functiondef('public.whatsapp_web_reservar(text,text)'::regprocedure);
 if position(anchor in src)=0 then raise exception 'Filtro da fila WhatsApp mudou; revisar integração.'; end if;
 execute replace(src,anchor,'and ((msg.cobranca_flow_id is not null or msg.acordo_flow_id is not null or msg.pre_juridico_flow_id is not null) or public.keila_whatsapp_elegivel(msg))');
end $$;
commit;
