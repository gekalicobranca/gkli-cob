-- Item 5: eventos comprovados, histórico imutável e transições atômicas.
begin;
create table public.acordo_formalizacao_eventos (
 id uuid primary key default gen_random_uuid(),
 acordo_id uuid not null references public.acordos(id) on delete cascade,
 carteira_id uuid not null references public.carteiras(id),
 evento text not null check(evento in ('termo_gerado','termo_rascunho','termo_liberado','termo_enviado','termo_entregue','termo_visualizado','termo_aceito','solicitacao_preparada','solicitacao_liberada','solicitacao_enviada','solicitacao_entregue','boletos_recebidos','boletos_enviados')),
 evidencia text not null check(length(btrim(evidencia))>=10),
 origem text not null check(origem in ('termo','mensagem','confirmacao_manual')),
 referencia text not null,
 usuario_id uuid references public.profiles(id),
 ocorrido_em timestamptz not null default clock_timestamp(),
 unique(acordo_id,evento,referencia)
);
create index acordo_formalizacao_eventos_acordo_idx on public.acordo_formalizacao_eventos(acordo_id,ocorrido_em);
alter table public.acordo_formalizacao_eventos enable row level security;
create policy formalizacao_eventos_leitura on public.acordo_formalizacao_eventos for select to authenticated
 using(public.current_user_can_access_carteira(carteira_id));
revoke all on public.acordo_formalizacao_eventos from public,anon,authenticated;
grant select on public.acordo_formalizacao_eventos to authenticated,service_role;

-- Amplia a constraint vigente sem remover estados de outros fluxos.
do $$ declare expr text;
begin
 select pg_get_expr(conbin,conrelid) into strict expr from pg_constraint
 where conrelid='public.acordos'::regclass and conname='acordos_fluxo_status_chk';
 alter table public.acordos drop constraint acordos_fluxo_status_chk;
 execute 'alter table public.acordos add constraint acordos_fluxo_status_chk check (('||expr||') or fluxo_status=''solicitacao_boletos_preparada'') not valid';
end $$;

-- A confirmação SMTP fica em tabela de tentativas não gravável pelo operador.
create function public.acordo_mensagem_envio_comprovado(p_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.email_tentativas where mensagem_id=p_id and estado='enviado')
 or exists(select 1 from public.thunderbird_envios where mensagem_id=p_id and estado='enviado')
 or exists(select 1 from public.whatsapp_web_envios where mensagem_id=p_id and estado='enviado');
$$;
revoke all on function public.acordo_mensagem_envio_comprovado(uuid) from public,anon,authenticated;

create function public.acordo_registrar_evento_mensagem() returns trigger
language plpgsql security definer set search_path='' as $$
declare a public.acordos%rowtype; prefixo text; etapa text; enviado boolean; entregue boolean;
begin
 if tg_op='UPDATE' and (old.origem_evento='acordo_boletos_administradora' or old.payload->>'termo_id' is not null)
  and (new.acordo_id is distinct from old.acordo_id or new.carteira_id is distinct from old.carteira_id
   or new.origem_evento is distinct from old.origem_evento or new.payload->>'termo_id' is distinct from old.payload->>'termo_id') then
  raise exception 'Não altere o vínculo de uma mensagem de formalização.';
 end if;
 if new.acordo_id is null then return new; end if;
 prefixo:=case when new.origem_evento='acordo_boletos_administradora' then 'solicitacao'
  when new.payload->>'termo_id' is not null then 'termo' else null end;
 if prefixo is null then return new; end if;
 select * into strict a from public.acordos where id=new.acordo_id for update;
 if a.carteira_id is distinct from new.carteira_id then raise exception 'Mensagem fora da carteira do acordo.'; end if;
 if prefixo='termo' and not exists(select 1 from public.acordos_termos t where t.id::text=new.payload->>'termo_id' and t.acordo_id=a.id and t.carteira_id=a.carteira_id) then
  raise exception 'Termo não pertence ao acordo.';
 end if;
 enviado:=public.acordo_mensagem_envio_comprovado(new.id);
 -- APIs de transporte distintas: somente backend confiável e recibo do provedor.
 enviado:=enviado or (coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb->>'role'='service_role'
  and nullif(btrim(new.provider_message_id),'') is not null and new.provider_status in ('enviado','sent','delivered','read'));
 entregue:=enviado and new.provider_status in ('delivered','read')
  and coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb->>'role'='service_role'
  and nullif(btrim(new.provider_message_id),'') is not null;
 if new.provider_status in ('delivered','read') and entregue is not true then
  raise exception 'Entrega exige confirmação autenticada do provedor.';
 end if;
 if (new.status in ('enviada','entregue','lida') or new.provider_status in ('enviado','sent','delivered','read')) and enviado is not true then
  raise exception 'Envio sem confirmação do transporte. Marcar status não comprova envio.';
 end if;
 etapa:=case when prefixo='termo' then 'termo_rascunho' else 'solicitacao_preparada' end;
 insert into public.acordo_formalizacao_eventos(acordo_id,carteira_id,evento,evidencia,origem,referencia,usuario_id)
 values(a.id,a.carteira_id,etapa,'Mensagem preparada: '||new.id,'mensagem',new.id::text,auth.uid()) on conflict do nothing;
 if new.status in ('aprovada','agendada','enviada','entregue','lida') or enviado then
  insert into public.acordo_formalizacao_eventos(acordo_id,carteira_id,evento,evidencia,origem,referencia,usuario_id)
  values(a.id,a.carteira_id,prefixo||case when prefixo='solicitacao' then '_liberada' else '_liberado' end,'Mensagem liberada: '||new.id,'mensagem',new.id::text,auth.uid()) on conflict do nothing;
 end if;
 if enviado then
  if a.exige_aprovacao_sindico and a.sindico_aprovado_em is null
   and (prefixo='solicitacao' or exists(select 1 from public.acordos_termos t where t.id::text=new.payload->>'termo_id' and t.tipo_aceite='devedor')) then raise exception 'Aprovação obrigatória pendente.'; end if;
  insert into public.acordo_formalizacao_eventos(acordo_id,carteira_id,evento,evidencia,origem,referencia,usuario_id)
  values(a.id,a.carteira_id,prefixo||case when prefixo='termo' then '_enviado' else '_enviada' end,'Envio confirmado pelo transporte: '||new.id,'mensagem',new.id::text,auth.uid()) on conflict do nothing;
 end if;
 if entregue then
  insert into public.acordo_formalizacao_eventos(acordo_id,carteira_id,evento,evidencia,origem,referencia,usuario_id)
  values(a.id,a.carteira_id,prefixo||'_entregue','Entrega confirmada pelo provedor: '||new.id,'mensagem',new.id::text,auth.uid()) on conflict do nothing;
 end if;
 if prefixo='solicitacao' and a.status not in ('cancelado','quebrado','renegociado','quitado') then
  if enviado and not exists(select 1 from public.acordo_formalizacao_eventos where acordo_id=a.id and evento in ('boletos_recebidos','boletos_enviados')) then
   update public.acordos set fluxo_status='boletos_solicitados',boletos_solicitados_em=coalesce((select min(ocorrido_em) from public.acordo_formalizacao_eventos where acordo_id=a.id and evento='solicitacao_enviada'),clock_timestamp()) where id=a.id;
  elsif not enviado and a.fluxo_status in ('rascunho','aceito_aguardando_boletos','aguardando_aceite_devedor','solicitacao_boletos_preparada') then
   update public.acordos set fluxo_status='solicitacao_boletos_preparada' where id=a.id;
  end if;
 end if;
 return new;
end $$;
revoke all on function public.acordo_registrar_evento_mensagem() from public,anon,authenticated;
create trigger acordo_evento_mensagem after insert or update on public.mensagens
 for each row execute function public.acordo_registrar_evento_mensagem();

create function public.acordo_registrar_evento_termo() returns trigger
language plpgsql security definer set search_path='' as $$
declare etapa text; a public.acordos%rowtype;
begin
 select * into strict a from public.acordos where id=new.acordo_id;
 if a.carteira_id is distinct from new.carteira_id then raise exception 'Termo fora da carteira do acordo.'; end if;
 insert into public.acordo_formalizacao_eventos(acordo_id,carteira_id,evento,evidencia,origem,referencia,usuario_id)
 values(a.id,a.carteira_id,'termo_gerado','Documento gerado: '||new.id,'termo',new.id::text,auth.uid()) on conflict do nothing;
 etapa:=case when new.status='aceito' and new.aceito_em is not null then 'termo_aceito'
  when new.visualizado_em is not null then 'termo_visualizado' end;
 if etapa is not null then
  insert into public.acordo_formalizacao_eventos(acordo_id,carteira_id,evento,evidencia,origem,referencia,usuario_id)
  values(a.id,a.carteira_id,etapa,'Evidência no termo: '||new.id,'termo',new.id::text,auth.uid()) on conflict do nothing;
 end if;
 return new;
end $$;
revoke all on function public.acordo_registrar_evento_termo() from public,anon,authenticated;
create trigger acordo_evento_termo after insert or update on public.acordos_termos
 for each row execute function public.acordo_registrar_evento_termo();

create function public.acordo_confirmar_envio_termo(p_acordo uuid,p_termo uuid,p_canal text,p_evidencia text) returns void
language plpgsql security definer set search_path='' as $$
declare a public.acordos%rowtype; t public.acordos_termos%rowtype;
begin
 select * into a from public.acordos where id=p_acordo for update;
 if not found or auth.uid() is null or public.current_user_can_access_carteira(a.carteira_id) is not true
  or not exists(select 1 from public.profiles where id=auth.uid() and role in ('admin','gestor','operador')) then raise exception 'Sem permissão para confirmar envio.'; end if;
 select * into t from public.acordos_termos where id=p_termo and acordo_id=a.id and carteira_id=a.carteira_id;
 if not found then raise exception 'Termo não pertence ao acordo.'; end if;
 if a.status in ('cancelado','quebrado','renegociado','quitado') or t.status not in ('pendente','visualizado','aceito') then raise exception 'Formalização encerrada.'; end if;
 if t.tipo_aceite='devedor' and a.exige_aprovacao_sindico and a.sindico_aprovado_em is null then raise exception 'Aprovação obrigatória pendente.'; end if;
 if p_canal is null or p_canal not in ('email','whatsapp','devedor','sindico') or p_evidencia is null or length(btrim(p_evidencia))<10 or length(p_evidencia)>2000 then raise exception 'Canal e evidência do envio obrigatórios.'; end if;
 if exists(select 1 from public.acordo_formalizacao_eventos where acordo_id=a.id and evento='termo_enviado' and referencia=t.id::text) then raise exception 'Envio já confirmado.'; end if;
 insert into public.acordo_formalizacao_eventos(acordo_id,carteira_id,evento,evidencia,origem,referencia,usuario_id)
 values(a.id,a.carteira_id,'termo_enviado',p_canal||': '||btrim(p_evidencia),'confirmacao_manual',t.id::text,auth.uid());
 -- Envio não implica visualização nem aceite. Mensagem interna não muda para enviada.
end $$;
revoke all on function public.acordo_confirmar_envio_termo(uuid,uuid,text,text) from public,anon;
grant execute on function public.acordo_confirmar_envio_termo(uuid,uuid,text,text) to authenticated;

create function public.acordo_confirmar_etapa_boletos(p_acordo uuid,p_evento text,p_evidencia text) returns void
language plpgsql security definer set search_path='' as $$
declare a public.acordos%rowtype; anterior text; novo text;
begin
 select * into a from public.acordos where id=p_acordo for update;
 if not found or auth.uid() is null or public.current_user_can_access_carteira(a.carteira_id) is not true
  or not exists(select 1 from public.profiles where id=auth.uid() and role in ('admin','gestor','operador')) then raise exception 'Sem permissão para confirmar boletos.'; end if;
 if a.status in ('cancelado','quebrado','renegociado','quitado') then raise exception 'Acordo encerrado.'; end if;
 if a.exige_aprovacao_sindico and a.sindico_aprovado_em is null then raise exception 'Aprovação obrigatória pendente.'; end if;
 if p_evento not in ('solicitacao_enviada','boletos_recebidos','boletos_enviados') or p_evento is null then raise exception 'Etapa inválida.'; end if;
 if p_evidencia is null or length(btrim(p_evidencia))<10 or length(p_evidencia)>2000 then raise exception 'Informe a evidência (protocolo, documento ou referência do envio/recebimento).'; end if;
 if exists(select 1 from public.acordo_formalizacao_eventos where acordo_id=a.id and evento=p_evento) then raise exception 'Etapa já confirmada. Recarregue o acordo.'; end if;
 anterior:=case p_evento when 'solicitacao_enviada' then 'solicitacao_preparada' when 'boletos_recebidos' then 'solicitacao_enviada' else 'boletos_recebidos' end;
 if not exists(select 1 from public.acordo_formalizacao_eventos where acordo_id=a.id and evento=anterior)
  and not (p_evento='solicitacao_enviada' and exists(select 1 from public.mensagens where acordo_id=a.id and carteira_id=a.carteira_id and origem_evento='acordo_boletos_administradora')) then
  raise exception 'Etapa anterior sem evidência: %.',anterior;
 end if;
 novo:=case p_evento when 'solicitacao_enviada' then 'boletos_solicitados' else p_evento end;
 insert into public.acordo_formalizacao_eventos(acordo_id,carteira_id,evento,evidencia,origem,referencia,usuario_id)
 values(a.id,a.carteira_id,p_evento,btrim(p_evidencia),'confirmacao_manual',p_evento,auth.uid());
 update public.acordos set fluxo_status=novo,
  boletos_solicitados_em=case when p_evento='solicitacao_enviada' then (select min(ocorrido_em) from public.acordo_formalizacao_eventos where acordo_id=a.id and evento='solicitacao_enviada') else boletos_solicitados_em end
 where id=a.id;
 if p_evento in ('boletos_recebidos','boletos_enviados') then
  update public.central_pendencias set status='resolvida',resolvido_em=clock_timestamp(),updated_at=clock_timestamp()
  where acordo_id=a.id and carteira_id=a.carteira_id and tipo='emissao_boletos_acordo' and status not in ('resolvida','cancelada');
 end if;
end $$;
revoke all on function public.acordo_confirmar_etapa_boletos(uuid,text,text) from public,anon;
grant execute on function public.acordo_confirmar_etapa_boletos(uuid,text,text) to authenticated;

-- Impede contornar o RPC usando UPDATE direto, inclusive durante a criação.
create function public.acordo_proteger_etapa_boletos() returns trigger
language plpgsql security definer set search_path='' as $$
declare v_evento text;
begin
 if (tg_op='INSERT' and new.boletos_solicitados_em is not null)
  or (tg_op='UPDATE' and new.boletos_solicitados_em is distinct from old.boletos_solicitados_em) then
  if not exists(select 1 from public.acordo_formalizacao_eventos where acordo_id=new.id and evento='solicitacao_enviada') then raise exception 'Solicitação sem evidência de envio.'; end if;
 end if;
 if tg_op='UPDATE' and new.fluxo_status is not distinct from old.fluxo_status then return new; end if;
 v_evento:=case new.fluxo_status when 'boletos_solicitados' then 'solicitacao_enviada' when 'boletos_recebidos' then 'boletos_recebidos' when 'boletos_enviados' then 'boletos_enviados' end;
 if v_evento is not null and not exists(select 1 from public.acordo_formalizacao_eventos e where e.acordo_id=new.id and e.evento=v_evento) then raise exception 'Etapa de boletos sem evidência: %.',v_evento; end if;
 if v_evento='solicitacao_enviada' and exists(select 1 from public.acordo_formalizacao_eventos e where e.acordo_id=new.id and e.evento in ('boletos_recebidos','boletos_enviados')) then raise exception 'Não é permitido retroceder etapas de boletos.'; end if;
 if v_evento='boletos_recebidos' and exists(select 1 from public.acordo_formalizacao_eventos e where e.acordo_id=new.id and e.evento='boletos_enviados') then raise exception 'Não é permitido retroceder etapas de boletos.'; end if;
 return new;
end $$;
revoke all on function public.acordo_proteger_etapa_boletos() from public,anon,authenticated;
create trigger acordo_proteger_boletos before insert or update on public.acordos
 for each row execute function public.acordo_proteger_etapa_boletos();
notify pgrst,'reload schema';
commit;
