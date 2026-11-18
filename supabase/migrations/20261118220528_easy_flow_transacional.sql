begin;

alter table public.easy_flow_execucoes add column protocolo integer not null default 1;
create unique index easy_flow_identidade on public.cobranca_flows((payload->>'easy_execucao_id'),(payload->>'easy_indice')) where payload ? 'easy_execucao_id';
create unique index easy_flow_item_identidade on public.lote_itens((payload->>'easy_execucao_id'),cobranca_id) where payload ? 'easy_execucao_id';
create table public.easy_flow_partes (
  execucao_id uuid not null references public.easy_flow_execucoes(id),
  indice integer not null check(indice>=0),
  cobranca_ids uuid[] not null,
  snapshot text not null,
  flow_id uuid unique references public.cobranca_flows(id),
  lote_id uuid unique references public.lotes(id),
  mensagem_ids uuid[] not null default '{}',
  manifesto_hash text,
  artefatos_hash text,
  snapshot_liberacao text,
  montada_em timestamptz,
  liberada_em timestamptz,
  liberada_por uuid,
  resultado_liberacao integer,
  primary key(execucao_id,indice)
);
create table public.easy_flow_reservas (
  cobranca_id uuid primary key references public.cobrancas(id),
  unidade_id uuid not null references public.unidades(id),
  execucao_id uuid not null references public.easy_flow_execucoes(id),
  canais text[] not null
);
create index on public.easy_flow_reservas(unidade_id);
create index on public.easy_flow_reservas(execucao_id);
create table public.easy_flow_eventos (
  id uuid primary key default gen_random_uuid(),
  execucao_id uuid not null references public.easy_flow_execucoes(id),
  operador_id uuid not null,
  evento text not null,
  dados jsonb not null,
  criado_em timestamptz not null default now()
);
create index on public.easy_flow_eventos(execucao_id,criado_em);
alter table public.easy_flow_partes enable row level security;
alter table public.easy_flow_reservas enable row level security;
alter table public.easy_flow_eventos enable row level security;
revoke all on public.easy_flow_partes,public.easy_flow_reservas,public.easy_flow_eventos from public,anon,authenticated,service_role;
grant select,insert,update on public.easy_flow_partes to service_role;
grant select,insert,delete on public.easy_flow_reservas to service_role;
grant select,insert on public.easy_flow_eventos to service_role;

create function public.easy_flow_p0c_versao() returns integer language sql immutable set search_path='' as $$select 3$$;

create function public.easy_flow_autorizar(p_operador uuid,p_carteira uuid,p_autor uuid)
returns void language plpgsql security invoker set search_path='' as $$
begin
  if p_operador is null or p_operador is distinct from p_autor or not exists(
    select 1 from public.profiles p where p.id=p_operador and p.role in ('admin','gestor','operador')
    and (p.role='admin' or exists(select 1 from public.usuarios_carteiras uc where uc.user_id=p.id and uc.carteira_id=p_carteira)))
  then raise exception 'Montagem indisponível para este usuário.' using errcode='42501'; end if;
end $$;

-- Barreira para escritores legados que não usam advisory locks. Leitura continua
-- disponível; timeout sempre resulta em rollback. Sem conexão com providers.
create function public.easy_flow_travar() returns void language plpgsql security invoker set search_path='' as $$
begin
  lock table public.profiles,public.usuarios_carteiras,public.condominios,public.carteiras,
    public.reguas,public.regua_etapas,public.mensagens_templates,public.unidades,public.responsaveis_unidades,
    public.cobrancas,public.cobranca_parcelas,public.acordos,public.acordo_cobrancas,public.scanner_baixas,
    public.regua_pausas,public.regua_compliance_regras,public.regua_destinatarios_bloqueados,
    public.integracoes_smtp_config,public.integracoes_smtp_rotas_condominio,
    public.mensagens,public.lotes,public.lote_itens,public.cobranca_flows,
    public.email_tentativas,public.whatsapp_web_envios,public.email_agenda,
    public.flow_progressao,public.maestro_flow_montagens,public.agente_receitas,public.agente_administradoras,
    public.easy_flow_execucoes,public.easy_flow_partes,public.easy_flow_reservas
    in share row exclusive mode;
end $$;

-- Retorna somente hash, nunca contatos, conteúdo ou credenciais. JSONB ordenado
-- no servidor evita depender de updated_at incompleto ou ordem do PostgREST.
create function public.easy_flow_snapshot(p_condominio uuid,p_regua uuid,p_ids uuid[] default null,p_execucao uuid default null)
returns text language plpgsql security invoker set search_path='' as $$
declare c public.condominios; dados jsonb; nome text; filtro text; parcela jsonb;
begin
  select * into strict c from public.condominios where id=p_condominio;
  dados:=jsonb_build_object('condominio',to_jsonb(c),'data',(now() at time zone 'America/Sao_Paulo')::date);
  for nome,filtro in select * from (values
    ('carteiras','id=$1'),('reguas','id=$3'),('regua_etapas','regua_id=$3'),
    ('mensagens_templates','true'),('regua_compliance_regras','true'),('regua_destinatarios_bloqueados','true'),
    ('regua_pausas','true'),('agente_receitas','true'),('agente_administradoras','true'),
    ('integracoes_smtp_config','carteira_id=$1'),('integracoes_smtp_rotas_condominio','condominio_id=$2'),
    ('responsaveis_unidades','condominio_id=$2'),('unidades','condominio_id=$2'),
    ('cobrancas','condominio_id=$2 and ($4 is null or id=any($4))'),
    ('cobranca_parcelas','cobranca_id in (select id from public.cobrancas where condominio_id=$2 and ($4 is null or id=any($4)))'),
    ('acordos','carteira_id=$1'),
    ('acordo_cobrancas','cobranca_id in (select id from public.cobrancas where condominio_id=$2 and ($4 is null or id=any($4)))'),
    ('scanner_baixas','cobranca_id in (select id from public.cobrancas where condominio_id=$2 and ($4 is null or id=any($4)))'),
    ('maestro_flow_montagens','condominio_id=$2'),
    ('flow_progressao','carteira_id=$1 and cobranca_ids && array(select id from public.cobrancas where condominio_id=$2 and ($4 is null or id=any($4)))'),
    ('mensagens','carteira_id=$1 and cobranca_id in (select id from public.cobrancas where condominio_id=$2 and ($4 is null or id=any($4))) and ($5 is null or coalesce(payload->>''easy_execucao_id'','''')<>$5::text)')
  ) x(nome,filtro) loop
    execute format('select coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),''[]''::jsonb) from public.%I t where %s',nome,filtro)
      into parcela using c.carteira_id,p_condominio,p_regua,p_ids,p_execucao;
    dados:=dados||jsonb_build_object(nome,parcela);
  end loop;
  return md5(dados::text);
end $$;

create function public.easy_flow_iniciar(p_operador uuid,p_condominio uuid,p_regua uuid,p_smtp uuid,
  p_plano jsonb,p_versoes jsonb,p_config text,p_resumo jsonb,p_snapshot text)
returns public.easy_flow_execucoes language plpgsql security invoker set search_path='' set lock_timeout='5s' set statement_timeout='60s' as $$
declare c public.condominios; r public.easy_flow_execucoes; ids uuid[]; parte jsonb; idx integer:=0; v_canais text[];
begin
  perform public.easy_flow_travar();
  select * into strict c from public.condominios where id=p_condominio;
  perform public.easy_flow_autorizar(p_operador,c.carteira_id,p_operador);
  select * into r from public.easy_flow_execucoes where condominio_id=c.id and status in ('preview','montando','entre_partes','pronto','liberando','atencao');
  if found then perform public.easy_flow_autorizar(p_operador,r.carteira_id,r.criado_por); return r; end if;
  if c.status<>'ativo' or p_snapshot is distinct from public.easy_flow_snapshot(c.id,p_regua) then
    raise exception 'O resumo mudou. Confira novamente antes de montar.'; end if;
  select array_agg(distinct e.canal) into v_canais from public.regua_etapas e join public.reguas g on g.id=e.regua_id
    where g.id=p_regua and g.carteira_id=c.carteira_id and g.tipo='cobranca' and g.ativo is distinct from false
      and g.status is distinct from 'inativa' and e.ativo is distinct from false;
  if v_canais is null or not(v_canais<@array['email','whatsapp']) or jsonb_array_length(p_plano)=0 then raise exception 'Plano de régua inválido.'; end if;
  select array_agg(x::uuid) into ids from jsonb_array_elements(p_plano) p, jsonb_array_elements_text(p) x;
  if cardinality(ids)>5000 or cardinality(ids)<>(select count(distinct x) from unnest(ids) x)
    or exists(select 1 from unnest(ids) x left join public.cobrancas b on b.id=x where b.id is null or b.condominio_id<>c.id or b.carteira_id<>c.carteira_id)
    or exists(select 1 from public.easy_flow_reservas v join public.cobrancas b on b.unidade_id=v.unidade_id where b.id=any(ids) and v.canais&&v_canais)
    or exists(select 1 from public.lote_itens i join public.cobrancas b on b.id=i.cobranca_id where b.unidade_id in (select unidade_id from public.cobrancas where id=any(ids)))
    or exists(select 1 from public.mensagens m join public.cobrancas b on b.id=m.cobranca_id where b.unidade_id in (select unidade_id from public.cobrancas where id=any(ids)) and m.status<>'cancelada' and m.canal=any(v_canais))
    or exists(select 1 from public.maestro_flow_montagens m where m.condominio_id=c.id and m.status in ('pendente','processando','atencao'))
  then raise exception 'Há vínculos ou reservas concorrentes. Revise as cobranças no painel completo.'; end if;
  if exists(select 1 from public.cobrancas b join public.unidades u on u.id=b.unidade_id where b.id=any(ids) and
    (b.automacao_bloqueada or u.acao_judicial or b.arquivada_em is not null or b.duplicada_de_id is not null
      or nullif(trim(u.responsavel_nome),'') is null or b.status_operacional not in ('novo','em_cobranca_ativa')
      or b.status_financeiro in ('quitado','renegociado') or b.valor_atualizado is null or b.valor_atualizado<=0
      or b.data_pagamento is not null or coalesce(b.valor_pago,0)>0
      or b.status in ('possivel_acordo','acordo_firmado','acordo_efetivado','acordo_quebrado','pre_distribuicao','pre_juridico','judicializado','suspenso')))
    or exists(select 1 from public.acordos a where a.cobranca_id=any(ids) and a.status in ('ativo','em_dia','em_atraso'))
    or exists(select 1 from public.acordo_cobrancas ac join public.acordos a on a.id=ac.acordo_id where ac.cobranca_id=any(ids) and a.status in ('ativo','em_dia','em_atraso'))
    or exists(select 1 from public.scanner_baixas s where s.cobranca_id=any(ids))
    or exists(select 1 from public.agente_receitas a join public.agente_administradoras g on g.id=a.administradora_id where a.ativo and g.ativo and nullif(a.script_key,'') is not null and a.config_json->>'condominio_id'=c.id::text)
  then raise exception 'Cobranças fora da elegibilidade Easy Flow.'; end if;
  if exists(select 1 from jsonb_array_elements(p_plano) with ordinality partes(v,idx),jsonb_array_elements_text(v) x
    join public.cobrancas b on b.id=x::uuid group by b.unidade_id having count(distinct partes.idx)>1) then raise exception 'Uma unidade não pode ser dividida entre partes.'; end if;
  insert into public.easy_flow_execucoes(condominio_id,carteira_id,criado_por,regua_id,smtp_config_id,plano,versoes,config_version,resumo,protocolo)
    values(c.id,c.carteira_id,p_operador,p_regua,p_smtp,p_plano,p_versoes,p_config,p_resumo,3) returning * into r;
  for parte in select value from jsonb_array_elements(p_plano) loop
    select array_agg(x::uuid) into ids from jsonb_array_elements_text(parte) x;
    if cardinality(ids) not between 1 and 40 then raise exception 'Parte inválida.'; end if;
    insert into public.easy_flow_partes(execucao_id,indice,cobranca_ids,snapshot)
      values(r.id,idx,ids,public.easy_flow_snapshot(c.id,p_regua,ids,r.id));
    insert into public.easy_flow_reservas(cobranca_id,unidade_id,execucao_id,canais)
      select b.id,b.unidade_id,r.id,v_canais from public.cobrancas b where b.id=any(ids);
    idx:=idx+1;
  end loop;
  insert into public.easy_flow_eventos(execucao_id,operador_id,evento,dados) values(r.id,p_operador,'iniciada',jsonb_build_object('partes',idx,'snapshot',p_snapshot));
  return r;
end $$;

create function public.easy_flow_artefatos(p_flow uuid) returns text language sql stable security invoker set search_path='' as $$
  select md5(jsonb_build_object(
    'flow',(select jsonb_build_array(f.id,f.carteira_id,f.lote_id,f.regua_id,f.payload->'easy_execucao_id',f.payload->'easy_indice',f.payload->'cobranca_ids',f.payload->'condominio_id',f.payload->'canais') from public.cobranca_flows f where f.id=p_flow),
    'mensagens',(select jsonb_agg(jsonb_build_array(m.id,m.carteira_id,m.lote_id,m.cobranca_flow_id,m.cobranca_id,m.canal,m.destinatario,m.conteudo,m.conteudo_renderizado,m.fingerprint,m.template_id,m.regua_etapa_id,m.payload->'contexto',m.payload->'template_resolvido',m.payload->'whatsapp_template_nome',m.payload->'whatsapp_template_idioma',m.payload->'whatsapp_template_parametros',m.payload->'cobranca_ids',m.payload->'easy_execucao_id') order by m.id) from public.mensagens m where m.cobranca_flow_id=p_flow),
    'itens',(select jsonb_agg(jsonb_build_array(i.id,i.lote_id,i.cobranca_flow_id,i.cobranca_id,i.unidade_id,i.condominio_id,i.mensagem_id,i.regua_etapa_id) order by i.id) from public.lote_itens i where i.cobranca_flow_id=p_flow)
  )::text)
$$;

create function public.easy_flow_montar(p_execucao uuid,p_indice integer,p_operador uuid,p_manifesto jsonb)
returns public.easy_flow_execucoes language plpgsql security invoker set search_path='' set lock_timeout='5s' set statement_timeout='60s' as $$
declare r public.easy_flow_execucoes; p public.easy_flow_partes; lid uuid:=gen_random_uuid(); fid uuid:=gen_random_uuid(); mid uuid;
  m jsonb; bid uuid; vistos uuid[]:='{}'; mids uuid[]:='{}'; etapa uuid; antes jsonb; n integer;
begin
  perform public.easy_flow_travar();
  select * into strict r from public.easy_flow_execucoes where id=p_execucao for update;
  perform public.easy_flow_autorizar(p_operador,r.carteira_id,r.criado_por);
  if r.protocolo<>3 then raise exception 'Execução legada exige conferência manual.'; end if;
  select * into strict p from public.easy_flow_partes where execucao_id=r.id and indice=p_indice for update;
  -- Recibo é consultado antes da posição e do snapshot; resposta perdida não
  -- refaz preparação nem reverte o estado de mensagens já liberadas.
  if p.montada_em is not null then return r; end if;
  if r.parte<>p_indice or r.status not in ('preview','entre_partes') then raise exception 'Parte fora de ordem.'; end if;
  if p.snapshot is distinct from public.easy_flow_snapshot(r.condominio_id,r.regua_id,p.cobranca_ids,r.id) then raise exception 'Dados alterados. Montagem bloqueada para revisão.'; end if;
  n:=jsonb_array_length(p_manifesto->'mensagens');
  if n is null or n not between 1 and 20 then raise exception 'Manifesto inválido.'; end if;
  select array_agg(x::uuid) into vistos from jsonb_array_elements(p_manifesto->'mensagens') msg,jsonb_array_elements_text(msg->'cobranca_ids') x;
  if vistos is null or not(vistos@>p.cobranca_ids and vistos<@p.cobranca_ids)
    or cardinality(vistos)<>(select count(distinct x) from unnest(vistos) x) then raise exception 'Cobertura do manifesto inválida.'; end if;
  vistos:='{}';
  select e.id into strict etapa from public.regua_etapas e where e.regua_id=r.regua_id and e.ativo is distinct from false order by e.delay_dias,e.ordem,e.id limit 1;
  perform set_config('easy.flow_execucao',r.id::text,true);
  select jsonb_agg(jsonb_build_object('id',b.id,'status',b.status,'status_operacional',b.status_operacional)) into antes from public.cobrancas b where b.id=any(p.cobranca_ids);
  insert into public.lotes(id,carteira_id,regua_id,tipo,status,operador_id,iniciado_em,total_avaliadas,total_criadas,total_pendentes,resumo)
    values(lid,r.carteira_id,r.regua_id,'regua_cobranca','concluido',p_operador,now(),cardinality(p.cobranca_ids),n,n,jsonb_build_object('origem','easy_flow','easy_execucao_id',r.id,'indice',p_indice));
  insert into public.cobranca_flows(id,carteira_id,lote_id,regua_id,nome,status,pausado_em,total_mensagens,total_pendentes,criado_por,atualizado_por,payload)
    values(fid,r.carteira_id,lid,r.regua_id,'Easy Flow · '||r.id::text||' · '||p_indice,'pausado',now(),n,n,p_operador,p_operador,
      jsonb_build_object('contexto','flow_cobranca','canais',r.resumo->'canais','cobranca_ids',to_jsonb(p.cobranca_ids),'condominio_id',r.condominio_id,'regua_id',r.regua_id,'lote_id',lid,'easy_execucao_id',r.id,'easy_indice',p_indice));
  for m in select value from jsonb_array_elements(p_manifesto->'mensagens') loop
    if (m->>'etapa_id')::uuid is distinct from etapa or not exists(select 1 from public.regua_etapas e where e.id=etapa and e.canal=m->>'canal')
      or nullif(m->>'destinatario','') is null or nullif(m->>'conteudo','') is null or jsonb_array_length(m->'cobranca_ids')=0 then raise exception 'Mensagem inválida.'; end if;
    mid:=gen_random_uuid(); mids:=array_append(mids,mid);
    insert into public.mensagens(id,carteira_id,contexto,cobranca_id,canal,destinatario,conteudo,conteudo_renderizado,status,status_operacional,lote_id,cobranca_flow_id,regua_etapa_id,template_id,fingerprint,payload)
      values(mid,r.carteira_id,'cobranca',(m->'cobranca_ids'->>0)::uuid,m->>'canal',m->>'destinatario',m->>'conteudo',m->>'conteudo','pendente_aprovacao','pendente_aprovacao',lid,fid,etapa,(m->>'template_id')::uuid,
        'easy:'||r.id::text||':'||p_indice||':'||mid::text,coalesce(m->'payload','{}')||jsonb_build_object('easy_execucao_id',r.id));
    for bid in select x::uuid from jsonb_array_elements_text(m->'cobranca_ids') x loop
      if not(bid=any(p.cobranca_ids)) or bid=any(vistos) or exists(select 1 from public.cobrancas b where b.id=bid and b.unidade_id<>(select unidade_id from public.cobrancas where id=(m->'cobranca_ids'->>0)::uuid)) then raise exception 'Cobertura do manifesto inválida.'; end if;
      vistos:=array_append(vistos,bid);
      insert into public.lote_itens(lote_id,cobranca_id,unidade_id,condominio_id,regua_etapa_id,mensagem_id,cobranca_flow_id,status,fingerprint,payload)
        select lid,b.id,b.unidade_id,b.condominio_id,etapa,mid,fid,'criado','easy:'||r.id::text||':'||p_indice||':'||bid::text,coalesce(m->'payload','{}')||jsonb_build_object('easy_execucao_id',r.id) from public.cobrancas b where b.id=bid;
    end loop;
  end loop;
  if not(vistos@>p.cobranca_ids and vistos<@p.cobranca_ids) then raise exception 'Manifesto incompleto.'; end if;
  update public.cobrancas set status='em_cobranca_ativa',status_operacional='em_cobranca_ativa' where id=any(p.cobranca_ids) and status_operacional='novo';
  update public.easy_flow_partes set flow_id=fid,lote_id=lid,mensagem_ids=mids,montada_em=now(),manifesto_hash=md5(p_manifesto::text),artefatos_hash=public.easy_flow_artefatos(fid),
    snapshot_liberacao=public.easy_flow_snapshot(r.condominio_id,r.regua_id,p.cobranca_ids,r.id) where execucao_id=r.id and indice=p_indice;
  update public.easy_flow_execucoes set parte=parte+1,flow_ids=array_append(flow_ids,fid),mensagens=mensagens+n,status=case when parte+1=jsonb_array_length(plano) then 'pronto' else 'entre_partes' end,erro=null,updated_at=now() where id=r.id returning * into r;
  insert into public.easy_flow_eventos(execucao_id,operador_id,evento,dados) values(r.id,p_operador,'parte_montada',jsonb_build_object('indice',p_indice,'flow_id',fid,'mensagem_ids',mids,'cobrancas_antes',antes,'manifesto_hash',md5(p_manifesto::text)));
  return r;
end $$;

-- Conserva todas as proteções instaladas na ativação (judicial, agenda, etc.)
-- mantendo o OID público; dependências existentes continuam passando pelo guard.
do $$declare definicao text; begin
  definicao:=pg_get_functiondef('public.email_ativar_flow(uuid,text,uuid)'::regprocedure);
  if position('FUNCTION public.email_ativar_flow(' in definicao)=0 then raise exception 'Ativador incompatível. Revisar migration antes de aplicar.'; end if;
  execute replace(definicao,'FUNCTION public.email_ativar_flow(','FUNCTION public.email_ativar_flow_sem_easy(');
end $$;

create function public.easy_flow_liberar(p_execucao uuid,p_indice integer,p_operador uuid,p_remetente text)
returns integer language plpgsql security invoker set search_path='' set lock_timeout='5s' set statement_timeout='60s' as $$
declare r public.easy_flow_execucoes; p public.easy_flow_partes; n integer;
begin
  perform public.easy_flow_travar();
  select * into strict r from public.easy_flow_execucoes where id=p_execucao for update;
  perform public.easy_flow_autorizar(p_operador,r.carteira_id,r.criado_por);
  if r.protocolo<>3 then raise exception 'Execução legada exige conferência manual.'; end if;
  select * into strict p from public.easy_flow_partes where execucao_id=r.id and indice=p_indice for update;
  if p.liberada_em is not null then return p.resultado_liberacao; end if;
  if r.status<>'pronto' or r.liberadas<>p_indice or p.montada_em is null
    or p.artefatos_hash is distinct from public.easy_flow_artefatos(p.flow_id)
    or p.snapshot_liberacao is distinct from public.easy_flow_snapshot(r.condominio_id,r.regua_id,p.cobranca_ids,r.id)
    or not exists(select 1 from public.cobranca_flows f where f.id=p.flow_id and f.status='pausado')
    or exists(select 1 from public.mensagens m where m.cobranca_flow_id=p.flow_id and (m.status<>'pendente_aprovacao' or coalesce(to_jsonb(m)->>'sent_at',to_jsonb(m)->>'enviada_em',to_jsonb(m)->>'enviado_em') is not null or m.scheduled_at is not null or m.agendada_para is not null))
    or exists(select 1 from public.email_tentativas t where t.mensagem_id=any(p.mensagem_ids))
    or exists(select 1 from public.whatsapp_web_envios w where w.mensagem_id=any(p.mensagem_ids))
  then raise exception 'A liberação exige revisão dos dados, vínculos ou tentativas.'; end if;
  if r.smtp_config_id is not null and (not exists(select 1 from public.integracoes_smtp_config s where s.id=r.smtp_config_id and s.carteira_id=r.carteira_id and s.ativo)
    or exists(select 1 from public.integracoes_smtp_rotas_condominio s where s.condominio_id=r.condominio_id and (not s.ativo or s.smtp_config_id<>r.smtp_config_id or s.carteira_id<>r.carteira_id))) then raise exception 'Conta SMTP indisponível.'; end if;
  perform set_config('easy.flow_execucao',r.id::text,true);
  n:=public.email_ativar_flow_sem_easy(p.flow_id,p_remetente,p_operador);
  if n<>cardinality(p.mensagem_ids)
    or not exists(select 1 from public.cobranca_flows f where f.id=p.flow_id and f.status='em_execucao')
    or exists(select 1 from public.mensagens m where m.id=any(p.mensagem_ids) and
      (m.status<>'agendada' or m.scheduled_at is null or m.agendada_para is null
        or (m.canal='email' and not exists(select 1 from public.email_agenda a where a.mensagem_id=m.id))))
  then raise exception 'Agendamento incompleto.'; end if;
  update public.easy_flow_partes set liberada_em=now(),liberada_por=p_operador,resultado_liberacao=n where execucao_id=r.id and indice=p_indice;
  update public.easy_flow_execucoes set liberadas=liberadas+1,status=case when liberadas+1=jsonb_array_length(plano) then 'concluido' else 'pronto' end,updated_at=now(),erro=null where id=r.id;
  delete from public.easy_flow_reservas where execucao_id=r.id and cobranca_id=any(p.cobranca_ids);
  insert into public.easy_flow_eventos(execucao_id,operador_id,evento,dados) values(r.id,p_operador,'parte_liberada',jsonb_build_object('indice',p_indice,'flow_id',p.flow_id,'mensagens',n));
  return n;
end $$;

create or replace function public.email_ativar_flow(p_flow uuid,p_remetente text,p_usuario uuid default null)
returns integer language plpgsql security invoker set search_path='' as $$
declare p public.easy_flow_partes;
begin
  select * into p from public.easy_flow_partes where flow_id=p_flow;
  if found then return public.easy_flow_liberar(p.execucao_id,p.indice,p_usuario,p_remetente); end if;
  if exists(select 1 from public.easy_flow_execucoes r where p_flow=any(r.flow_ids) and r.status<>'cancelado') then raise exception 'Execução Easy legada exige conferência manual.'; end if;
  return public.email_ativar_flow_sem_easy(p_flow,p_remetente,p_usuario);
end $$;

create function public.easy_flow_reconciliar(p_execucao uuid,p_operador uuid)
returns public.easy_flow_execucoes language plpgsql security invoker set search_path='' set lock_timeout='5s' set statement_timeout='60s' as $$
declare r public.easy_flow_execucoes; p public.easy_flow_partes; ids uuid[]:='{}'; n integer:=0; montadas integer:=0; v_liberadas integer:=0; problema boolean:=false; anterior jsonb;
begin
  perform public.easy_flow_travar();
  select * into strict r from public.easy_flow_execucoes where id=p_execucao for update;
  perform public.easy_flow_autorizar(p_operador,r.carteira_id,r.criado_por);
  if r.protocolo<>3 or r.status='cancelado' then return r; end if;
  anterior:=to_jsonb(r);
  if (select count(*) from public.easy_flow_partes where execucao_id=r.id)<>jsonb_array_length(r.plano) then problema:=true; end if;
  for p in select * from public.easy_flow_partes where execucao_id=r.id order by indice loop
    if p.indice>=jsonb_array_length(r.plano) or to_jsonb(p.cobranca_ids) is distinct from r.plano->p.indice then problema:=true; end if;
    if p.montada_em is null then
      if p.flow_id is not null or p.lote_id is not null or cardinality(p.mensagem_ids)<>0 then problema:=true; end if;
    else
      if p.indice<>montadas or p.artefatos_hash is distinct from public.easy_flow_artefatos(p.flow_id)
        or (select count(*) from public.mensagens m where m.cobranca_flow_id=p.flow_id and m.id=any(p.mensagem_ids))<>cardinality(p.mensagem_ids) then problema:=true; end if;
      ids:=array_append(ids,p.flow_id);n:=n+cardinality(p.mensagem_ids);montadas:=montadas+1;
      if p.liberada_em is not null then
        if p.indice<>v_liberadas then problema:=true; end if;v_liberadas:=v_liberadas+1;
        if exists(select 1 from public.email_tentativas t where t.mensagem_id=any(p.mensagem_ids) and t.estado='incerto')
          or exists(select 1 from public.whatsapp_web_envios t where t.mensagem_id=any(p.mensagem_ids) and t.estado='incerto')
          or exists(select 1 from public.mensagens m where m.id=any(p.mensagem_ids) and (m.status in ('pendente_aprovacao','aprovada')
            or (m.canal='email' and m.status='agendada' and not exists(select 1 from public.email_agenda a where a.mensagem_id=m.id)))) then problema:=true; end if;
      elsif not exists(select 1 from public.cobranca_flows f where f.id=p.flow_id and f.status='pausado')
        or exists(select 1 from public.mensagens m where m.cobranca_flow_id=p.flow_id and (m.status<>'pendente_aprovacao' or coalesce(to_jsonb(m)->>'sent_at',to_jsonb(m)->>'enviada_em',to_jsonb(m)->>'enviado_em') is not null or m.scheduled_at is not null or m.agendada_para is not null))
        or exists(select 1 from public.email_tentativas t where t.mensagem_id=any(p.mensagem_ids))
        or exists(select 1 from public.whatsapp_web_envios t where t.mensagem_id=any(p.mensagem_ids)) then problema:=true; end if;
    end if;
  end loop;
  -- Não anexa artefatos órfãos nem deduz liberação a partir do status do Flow.
  if exists(select 1 from public.cobranca_flows f where f.payload->>'easy_execucao_id'=r.id::text and not(f.id=any(ids))) then problema:=true; end if;
  update public.easy_flow_execucoes set flow_ids=ids,parte=montadas,mensagens=n,liberadas=v_liberadas,
    status=case when problema then 'atencao' when v_liberadas=jsonb_array_length(plano) then 'concluido' when montadas=jsonb_array_length(plano) then 'pronto' when montadas>0 then 'entre_partes' else 'preview' end,
    erro=case when problema then 'Divergência de evidências. Revisão manual obrigatória.' else null end,updated_at=now() where id=r.id returning * into r;
  if (anterior-'updated_at') is distinct from (to_jsonb(r)-'updated_at') then
    insert into public.easy_flow_eventos(execucao_id,operador_id,evento,dados) values(r.id,p_operador,'reconciliada',jsonb_build_object('antes',anterior,'depois',to_jsonb(r)));
  end if;
  return r;
end $$;

create function public.easy_flow_descartar(p_execucao uuid,p_operador uuid)
returns void language plpgsql security invoker set search_path='' set lock_timeout='5s' as $$
declare r public.easy_flow_execucoes;
begin
  perform public.easy_flow_travar();
  select * into strict r from public.easy_flow_execucoes where id=p_execucao for update;
  perform public.easy_flow_autorizar(p_operador,r.carteira_id,r.criado_por);
  if r.protocolo<>3 or r.status<>'preview' or exists(select 1 from public.easy_flow_partes p where p.execucao_id=r.id and p.montada_em is not null)
    or exists(select 1 from public.cobranca_flows f where f.payload->>'easy_execucao_id'=r.id::text)
  then raise exception 'Montagem iniciada exige conferência manual.'; end if;
  update public.easy_flow_execucoes set status='cancelado',updated_at=now() where id=r.id;
  delete from public.easy_flow_reservas where execucao_id=r.id;
  insert into public.easy_flow_eventos(execucao_id,operador_id,evento,dados) values(r.id,p_operador,'resumo_descartado','{}');
end $$;

create function public.easy_flow_guardar() returns trigger language plpgsql security definer set search_path='' as $$
declare execucao uuid; fid uuid;
begin
  if tg_table_name='mensagens' then
    select v.execucao_id into execucao from public.easy_flow_reservas v join public.cobrancas b on b.unidade_id=v.unidade_id
      where (b.id=new.cobranca_id or b.id::text in (select jsonb_array_elements_text(case when jsonb_typeof(new.payload->'cobranca_ids')='array' then new.payload->'cobranca_ids' else '[]'::jsonb end)))
        and new.canal=any(v.canais) limit 1;
    fid:=new.cobranca_flow_id;
  elsif tg_table_name='lote_itens' then
    select v.execucao_id into execucao from public.easy_flow_reservas v join public.cobrancas b on b.unidade_id=v.unidade_id where b.id=new.cobranca_id limit 1;
    fid:=new.cobranca_flow_id;
  else fid:=new.id; end if;
  if execucao is not null and coalesce(current_setting('easy.flow_execucao',true),'')<>execucao::text then raise exception 'Cobrança reservada por montagem Easy Flow.'; end if;
  select p.execucao_id into execucao from public.easy_flow_partes p where p.flow_id=fid and p.liberada_em is null;
  if execucao is not null and coalesce(current_setting('easy.flow_execucao',true),'')<>execucao::text then
    if tg_table_name='cobranca_flows' then
      if new.status='em_execucao' then raise exception 'Liberação Easy requer recibo transacional.'; end if;
    elsif tg_table_name='mensagens' then
      if new.status not in ('pendente_aprovacao','cancelada') or new.scheduled_at is not null or new.agendada_para is not null then raise exception 'Mensagem Easy ainda não liberada.'; end if;
    end if;
  end if;
  return new;
end $$;
create trigger easy_flow_mensagens_guard before insert or update on public.mensagens for each row execute function public.easy_flow_guardar();
create trigger easy_flow_itens_guard before insert on public.lote_itens for each row execute function public.easy_flow_guardar();
create trigger easy_flow_ativacao_guard before update on public.cobranca_flows for each row execute function public.easy_flow_guardar();

-- Funções internas não são endpoints anônimos/autenticados. Service-role é o
-- único executor e as RPCs de negócio revalidam o ator e a carteira no banco.
do $$declare f record; begin
  for f in select p.oid::regprocedure assinatura from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and (p.proname like 'easy_flow_%' or p.proname='email_ativar_flow_sem_easy') loop
    execute format('revoke all on function %s from public,anon,authenticated',f.assinatura);
    execute format('grant execute on function %s to service_role',f.assinatura);
  end loop;
end $$;
revoke all on function public.email_ativar_flow(uuid,text,uuid) from public,anon,authenticated;
grant execute on function public.email_ativar_flow(uuid,text,uuid) to service_role;
notify pgrst,'reload schema';
commit;
