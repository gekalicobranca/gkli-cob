begin;
create table public.acordo_cancelamentos (
  operacao_id uuid primary key,
  acordo_id uuid not null unique references public.acordos(id),
  carteira_id uuid not null references public.carteiras(id),
  operador_id uuid not null references public.profiles(id),
  intencao_hash text not null,
  documento_id uuid references public.acordo_documentos(id),
  resultado jsonb not null,
  criado_em timestamptz not null default now()
);
alter table public.acordo_cancelamentos enable row level security;
revoke all on public.acordo_cancelamentos from public,anon,authenticated,service_role;
grant select,insert on public.acordo_cancelamentos to service_role;
grant insert,select(id) on public.acordo_documentos to service_role;

create function public.acordo_cancelamento_autorizar(p_operador uuid,p_carteira uuid)
returns void language plpgsql security invoker set search_path='' as $$
begin
  if p_operador is null or not exists(select 1 from public.profiles p where p.id=p_operador and p.role in ('admin','gestor','operador')
    and (p.role='admin' or exists(select 1 from public.usuarios_carteiras uc where uc.user_id=p.id and uc.carteira_id=p_carteira))) then
    raise exception 'Cancelamento indisponível para este usuário.' using errcode='42501';
  end if;
end $$;

create function public.acordo_cancelamento_resultado(p_operacao uuid,p_acordo uuid,p_operador uuid)
returns jsonb language plpgsql security invoker set search_path='' set lock_timeout='5s' as $$
declare a public.acordos; r public.acordo_cancelamentos;
begin
  -- Mesma trava do commit: ausência de recibo só é informada após terminar a
  -- transação concorrente da mesma operação, nunca durante a escrita parcial.
  perform pg_advisory_xact_lock(hashtextextended(p_operacao::text,192026));
  select * into strict a from public.acordos where id=p_acordo;
  perform public.acordo_cancelamento_autorizar(p_operador,a.carteira_id);
  select * into r from public.acordo_cancelamentos where operacao_id=p_operacao and acordo_id=a.id;
  if not found then return null; end if;
  if r.operador_id<>p_operador or r.carteira_id<>a.carteira_id then raise exception 'Cancelamento indisponível.' using errcode='42501'; end if;
  return r.resultado;
end $$;

create function public.acordo_cancelar_formalizacao_atomico(p_operacao uuid,p_acordo uuid,p_operador uuid,p_motivo text,p_observacao text default '',p_pdf text default null,p_nome text default null)
returns jsonb language plpgsql security invoker set search_path='' set lock_timeout='5s' set statement_timeout='60s' as $$
declare a public.acordos; recibo public.acordo_cancelamentos; intencao text; documento uuid; bytes bytea;
  ids uuid[]; mids uuid[]; fids uuid[]; msg public.mensagens; antes jsonb; depois jsonb; resultado jsonb;
  antes_cobrancas jsonb; antes_parcelas jsonb; financeiro_antes jsonb; parcelas_financeiro_antes jsonb; atualizadas integer:=0; canceladas integer:=0;
begin
  if p_operacao is null or p_acordo is null or length(trim(coalesce(p_motivo,''))) not between 1 and 2000 or length(coalesce(p_observacao,''))>2000
    or length(coalesce(p_pdf,''))>2666668 then raise exception 'Pedido de cancelamento inválido.'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_operacao::text,192026));
  -- Protege também contra pagamentos, termos, vínculos e transportes legados
  -- que não compartilham a trava de operação. Timeout sempre faz rollback.
  lock table public.profiles,public.usuarios_carteiras,public.acordos,public.acordos_termos,public.parcelas_acordo,
    public.acordo_cobrancas,public.cobrancas,public.unidades,public.mensagens,public.email_tentativas,
    public.whatsapp_web_envios,public.email_agenda,public.acordo_flows,public.central_pendencias in share row exclusive mode;
  select * into strict a from public.acordos where id=p_acordo for update;
  perform public.acordo_cancelamento_autorizar(p_operador,a.carteira_id);
  intencao:=md5(jsonb_build_object('acordo',p_acordo,'operador',p_operador,'motivo',trim(p_motivo),'observacao',coalesce(p_observacao,''),'pdf',p_pdf,'nome',p_nome)::text);
  select * into recibo from public.acordo_cancelamentos where operacao_id=p_operacao;
  if found then
    if recibo.acordo_id<>a.id or recibo.operador_id<>p_operador or recibo.carteira_id<>a.carteira_id or recibo.intencao_hash<>intencao then raise exception 'Chave de cancelamento pertence a outra intenção.'; end if;
    return recibo.resultado;
  end if;
  if a.status not in ('ativo','em_dia','em_atraso','vencido','suspenso') or a.status is null
    or a.status_financeiro in ('parcial','quitado','pago','renegociado') or nullif(to_jsonb(a)->>'data_quitacao','') is not null
    or exists(select 1 from public.parcelas_acordo p where p.acordo_id=a.id and
      (p.data_pagamento is not null or coalesce(p.valor_pago,0)>0 or lower(coalesce(p.status,'')) not in ('aberta','pendente','vencida','cancelada')))
    then raise exception 'Acordo fechado, pagamento ou parcela em situação que exige revisão.'; end if;
  if exists(select 1 from public.acordo_cancelamentos where acordo_id=a.id) then raise exception 'Já existe um cancelamento confirmado para este acordo.'; end if;
  select array_agg(distinct x) into ids from (
    select a.cobranca_id x union select c.cobranca_id from public.acordo_cobrancas c where c.acordo_id=a.id
  ) v where x is not null;
  ids:=coalesce(ids,'{}');
  if exists(select 1 from public.cobrancas b where b.id=any(ids) and b.carteira_id is distinct from a.carteira_id) then raise exception 'Vínculo fora da carteira do acordo.'; end if;
  select coalesce(array_agg(m.id),'{}') into mids from public.mensagens m where m.acordo_id=a.id
    or coalesce(m.payload->>'parcela_id',m.payload#>>'{contexto,parcela_id}') in (select p.id::text from public.parcelas_acordo p where p.acordo_id=a.id);
  if exists(select 1 from public.mensagens m where m.id=any(mids) and m.carteira_id is distinct from a.carteira_id) then raise exception 'Mensagem fora da carteira do acordo.'; end if;
  if exists(select 1 from public.mensagens m where m.id=any(mids) and m.status in ('em_envio','enviando','processando','incerto'))
    or exists(select 1 from public.email_tentativas e where e.mensagem_id=any(mids) and e.estado in ('em_envio','incerto'))
    or exists(select 1 from public.whatsapp_web_envios e where e.mensagem_id=any(mids) and e.estado in ('reservado','incerto')) then raise exception 'Há envio em andamento ou incerto. Revisão obrigatória.'; end if;
  if p_pdf is not null then
    bytes:=decode(p_pdf,'base64');
    if octet_length(bytes) not between 5 and 2000000 or substring(bytes from 1 for 5)<>decode('255044462d','hex') or length(trim(coalesce(p_nome,''))) not between 1 and 180 then raise exception 'Documento de cancelamento inválido.'; end if;
    -- Reutiliza o repositório privado existente. PDF e cancelamento têm o mesmo
    -- commit; rollback não deixa objeto de Storage, anexo ou evento órfão.
    insert into public.acordo_documentos(acordo_id,carteira_id,nome,tipo,documento,criado_por)
      values(a.id,a.carteira_id,trim(p_nome),'application/pdf',bytes,p_operador) returning id into documento;
  elsif p_nome is not null then raise exception 'Documento incompleto.'; end if;
  antes:=jsonb_build_object('status',a.status,'status_financeiro',a.status_financeiro,'fluxo_status',a.fluxo_status);
  select jsonb_agg(jsonb_build_object('id',b.id,'status',b.status,'status_operacional',b.status_operacional,'status_financeiro',b.status_financeiro)) into antes_cobrancas from public.cobrancas b where b.id=any(ids);
  select jsonb_agg(jsonb_build_object('id',p.id,'status',p.status,'data_pagamento',p.data_pagamento,'valor_pago',p.valor_pago)) into antes_parcelas from public.parcelas_acordo p where p.acordo_id=a.id;
  select jsonb_agg(jsonb_build_array(b.id,b.valor_original,b.valor_atualizado,b.multa,b.juros,b.correcao,b.status_financeiro,b.valor_pago,b.data_pagamento,b.duplicada_de_id,b.arquivada_em) order by b.id) into financeiro_antes from public.cobrancas b where b.id=any(ids);
  select jsonb_agg(to_jsonb(p)-array['status','updated_at','atualizado_em'] order by p.id) into parcelas_financeiro_antes from public.parcelas_acordo p where p.acordo_id=a.id;
  update public.acordos set status='cancelado',fluxo_status='cancelado' where id=a.id;
  update public.acordos_termos set status='expirado',updated_at=now() where acordo_id=a.id and status<>'aceito';
  update public.parcelas_acordo set status='cancelada' where acordo_id=a.id and status in ('aberta','pendente','vencida');
  -- Não altera situação financeira, valores ou histórico protegido. Vínculos de
  -- outro acordo e unidades judiciais/bloqueadas não voltam à automação.
  update public.cobrancas b set status='em_cobranca_ativa',status_operacional='em_cobranca_ativa'
    from public.unidades u where b.id=any(ids) and u.id=b.unidade_id and b.carteira_id=a.carteira_id
    and b.status_operacional in ('novo','em_cobranca_ativa','possivel_acordo','acordo_firmado','acordo_efetivado')
    and b.status_financeiro in ('em_aberto','vencido') and b.data_pagamento is null and coalesce(b.valor_pago,0)=0
    and b.arquivada_em is null and b.duplicada_de_id is null and not coalesce(b.automacao_bloqueada,false) and not coalesce(u.acao_judicial,false)
    and not exists(select 1 from public.acordos other where other.id<>a.id and other.status not in ('cancelado','renegociado','quitado')
      and (other.cobranca_id=b.id or exists(select 1 from public.acordo_cobrancas l where l.acordo_id=other.id and l.cobranca_id=b.id)));
  get diagnostics atualizadas=row_count;
  if (select to_jsonb(x)-array['status','fluxo_status','updated_at','atualizado_em'] from public.acordos x where x.id=a.id) is distinct from (to_jsonb(a)-array['status','fluxo_status','updated_at','atualizado_em'])
    or (select jsonb_agg(jsonb_build_array(b.id,b.valor_original,b.valor_atualizado,b.multa,b.juros,b.correcao,b.status_financeiro,b.valor_pago,b.data_pagamento,b.duplicada_de_id,b.arquivada_em) order by b.id) from public.cobrancas b where b.id=any(ids)) is distinct from financeiro_antes
    or (select jsonb_agg(to_jsonb(p)-array['status','updated_at','atualizado_em'] order by p.id) from public.parcelas_acordo p where p.acordo_id=a.id) is distinct from parcelas_financeiro_antes
    then raise exception 'O cancelamento alterou dados protegidos. Operação revertida.'; end if;
  select coalesce(array_agg(distinct m.acordo_flow_id) filter(where m.acordo_flow_id is not null),'{}') into fids from public.mensagens m where m.id=any(mids);
  update public.mensagens m set status='cancelada',status_operacional='cancelada',cancelada_em=now(),cancelado_em=now(),scheduled_at=null,agendada_para=null,motivo_cancelamento='Cancelamento de formalização '||p_operacao::text
    where m.id=any(mids) and m.status in ('rascunho','pendente_aprovacao','aprovada','agendada','falha')
      and coalesce(to_jsonb(m)->>'sent_at',to_jsonb(m)->>'enviada_em') is null
      and not exists(select 1 from public.email_tentativas e where e.mensagem_id=m.id and e.estado='enviado')
      and not exists(select 1 from public.whatsapp_web_envios e where e.mensagem_id=m.id and e.estado='enviado');
  get diagnostics canceladas=row_count;
  delete from public.email_agenda e using public.mensagens m where e.mensagem_id=m.id and m.id=any(mids) and m.status='cancelada';
  update public.central_pendencias set status='cancelada' where acordo_id=a.id and status not in ('resolvida','cancelada');
  update public.acordo_flows f set
    total_pendentes=(select count(*) from public.mensagens m where m.acordo_flow_id=f.id and m.status in ('pendente_aprovacao','aprovada')),
    total_agendadas=(select count(*) from public.mensagens m where m.acordo_flow_id=f.id and m.status='agendada'),
    status=case when not exists(select 1 from public.mensagens m where m.acordo_flow_id=f.id and m.status<>'cancelada') then 'cancelado' else f.status end
    where f.id=any(fids);
  depois:=jsonb_build_object('status','cancelado','status_financeiro',a.status_financeiro,'fluxo_status','cancelado');
  resultado:=jsonb_build_object('operacao_id',p_operacao,'acordo_id',a.id,'documento_id',documento,'cobrancas_reativadas',atualizadas,'mensagens_canceladas',canceladas,'confirmado',true);
  insert into public.timeline_operacional(carteira_id,entidade_tipo,entidade_id,evento_tipo,titulo,usuario_id,origem,payload)
    values(a.carteira_id,'acordo',a.id,'acordo.formalizacao_cancelada','Formalização cancelada',p_operador,'manual',
      resultado||jsonb_build_object('motivo',trim(p_motivo),'observacao',coalesce(p_observacao,'')));
  insert into public.auditoria_eventos(carteira_id,entidade_tipo,entidade_id,evento_tipo,titulo,usuario_id,antes,depois)
    values(a.carteira_id,'acordo',a.id,'acordo.formalizacao_cancelada','Formalização cancelada',p_operador,
      jsonb_build_object('acordo',antes,'cobrancas',antes_cobrancas,'parcelas',antes_parcelas),depois||resultado);
  insert into public.acordo_cancelamentos(operacao_id,acordo_id,carteira_id,operador_id,intencao_hash,documento_id,resultado)
    values(p_operacao,a.id,a.carteira_id,p_operador,intencao,documento,resultado);
  return resultado;
end $$;

-- O escritor financeiro que chegar depois do cancelamento também revalida o
-- estado. Não permite registrar pagamento tardio sobre formalização encerrada
-- por este protocolo; o valor precisa do fluxo de conciliação apropriado.
create function public.acordo_cancelamento_guardar_pagamento() returns trigger language plpgsql security definer set search_path='' as $$
begin
  if (new.data_pagamento is not null or coalesce(new.valor_pago,0)>0 or lower(coalesce(new.status,'')) in ('paga','pago','quitada','quitado','parcial'))
    and (tg_op='INSERT' or new.data_pagamento is distinct from old.data_pagamento or new.valor_pago is distinct from old.valor_pago or new.status is distinct from old.status) then
    perform 1 from public.acordos a where a.id=new.acordo_id for update;
    if exists(select 1 from public.acordo_cancelamentos c join public.acordos a on a.id=c.acordo_id where a.id=new.acordo_id and a.status='cancelado') then
      raise exception 'Formalização cancelada. Pagamento exige conciliação financeira.';
    end if;
  end if;
  return new;
end $$;
create trigger acordo_cancelamento_pagamento_guard before insert or update on public.parcelas_acordo for each row execute function public.acordo_cancelamento_guardar_pagamento();

revoke all on function public.acordo_cancelamento_autorizar(uuid,uuid),public.acordo_cancelamento_resultado(uuid,uuid,uuid),public.acordo_cancelar_formalizacao_atomico(uuid,uuid,uuid,text,text,text,text) from public,anon,authenticated;
grant execute on function public.acordo_cancelamento_autorizar(uuid,uuid),public.acordo_cancelamento_resultado(uuid,uuid,uuid),public.acordo_cancelar_formalizacao_atomico(uuid,uuid,uuid,text,text,text,text) to service_role;
revoke all on function public.acordo_cancelamento_guardar_pagamento() from public,anon,authenticated;
notify pgrst,'reload schema';
commit;
