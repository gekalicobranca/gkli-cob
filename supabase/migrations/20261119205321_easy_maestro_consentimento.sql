begin;
create table public.easy_maestro_pedidos (
  lote_id uuid primary key,operador_id uuid not null references public.profiles(id),administradora text not null,
  condominio_ids uuid[] not null,montar_flow boolean not null,ativacao_autorizada boolean not null,
  config_versao text not null,intencao_hash text not null,criadas integer not null default 0,criado_em timestamptz not null default now()
);
alter table public.easy_maestro_pedidos enable row level security;
revoke all on public.easy_maestro_pedidos from public,anon,authenticated,service_role;
grant select,insert,update(criadas) on public.easy_maestro_pedidos to service_role;

create function public.easy_maestro_scope(p_operador uuid) returns uuid[] language plpgsql security invoker set search_path='' as $$
declare papel text; carteiras uuid[];
begin
  select role into papel from public.profiles where id=p_operador;
  if papel is null or papel not in ('admin','gestor','operador') then raise exception 'Perfil sem permissão para captar.' using errcode='42501'; end if;
  if papel='admin' then return null; end if;
  select coalesce(array_agg(carteira_id),'{}') into carteiras from public.usuarios_carteiras where user_id=p_operador;
  return carteiras;
end $$;

create function public.easy_maestro_efeitos(p_operador uuid,p_administradora text,p_condominios uuid[],p_montar boolean)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare scope uuid[]; ids uuid[]; versao text; automatico boolean;
begin
  scope:=public.easy_maestro_scope(p_operador);
  select array_agg(distinct x order by x) into ids from unnest(p_condominios) x;
  if ids is null or cardinality(ids) not between 1 and 500 or nullif(trim(p_administradora),'') is null
    or exists(select 1 from unnest(ids) x where not exists(select 1 from public.easy_maestro_receitas(scope,lower(trim(p_administradora))) r where r.condominio_id=x)) then
    raise exception 'Seleção indisponível para esta carteira ou administradora.' using errcode='42501'; end if;
  select md5(jsonb_build_object(
    'condominios',(select jsonb_agg(jsonb_build_array(c.id,c.carteira_id,c.status,to_jsonb(c)->'regua_cobranca_id',to_jsonb(c)->'inicio_cobranca_dias',to_jsonb(c)->'dias_apos_vencimento_regua',to_jsonb(c)->'dias_cobranca_ativa',to_jsonb(c)->'pre_juridico_habilitado',to_jsonb(c)->'vencimento_cota_dia') order by c.id) from public.condominios c where c.id=any(ids)),
    'receitas',(select jsonb_agg(jsonb_build_array(r.id,r.administradora_id,r.ativo,r.script_key,r.config_json,to_jsonb(r)->'tipo_coleta',to_jsonb(r)->'tipo_arquivo_esperado') order by r.id) from public.agente_receitas r where r.config_json->>'condominio_id' in (select x::text from unnest(ids) x)),
    'controle',(select jsonb_agg(to_jsonb(c) order by c.carteira_id) from public.maestro_flow_controle c where c.carteira_id in (select carteira_id from public.condominios where id=any(ids))),
    'captacao',(select jsonb_agg(to_jsonb(c) order by c.chave) from public.automacao_controle c where c.chave='captacao_global'),
    'reguas',(select jsonb_agg(to_jsonb(r) order by r.id) from public.reguas r where r.carteira_id in (select carteira_id from public.condominios where id=any(ids))),
    'templates',(select jsonb_agg(to_jsonb(t) order by t.id) from public.mensagens_templates t where to_jsonb(t)->>'carteira_id' is null or to_jsonb(t)->>'carteira_id' in (select carteira_id::text from public.condominios where id=any(ids))),
    'etapas',(select jsonb_agg(to_jsonb(e) order by e.id) from public.regua_etapas e join public.reguas r on r.id=e.regua_id where r.carteira_id in (select carteira_id from public.condominios where id=any(ids)))
  )::text) into versao;
  automatico:=coalesce(p_montar,false) and exists(select 1 from public.maestro_flow_controle f join public.condominios c on c.carteira_id=f.carteira_id where c.id=any(ids) and f.ativo);
  return jsonb_build_object('versao',versao,'ativacaoAutomatica',automatico,'montarFlow',coalesce(p_montar,false),'condominios',cardinality(ids));
end $$;

create function public.easy_maestro_captar_confirmado(p_operador uuid,p_administradora text,p_lote uuid,p_montar boolean,p_condominios uuid[],p_versao text,p_ativacao boolean)
returns integer language plpgsql security invoker set search_path='' set lock_timeout='5s' set statement_timeout='30s' as $$
declare scope uuid[]; ids uuid[]; efeitos jsonb; hash text; pedido public.easy_maestro_pedidos; v_criadas integer;
begin
  if p_lote is null then raise exception 'Pedido inválido.'; end if;
  perform pg_advisory_xact_lock(15102026,1912);
  lock table public.profiles,public.usuarios_carteiras,public.condominios,public.agente_receitas,public.maestro_flow_controle,
    public.automacao_controle,public.reguas,public.regua_etapas,public.mensagens_templates,public.agente_execucoes in share row exclusive mode;
  scope:=public.easy_maestro_scope(p_operador);
  select array_agg(distinct x order by x) into ids from unnest(p_condominios) x;
  if ids is null or exists(select 1 from unnest(ids) x where not exists(select 1 from public.condominios c where c.id=x and (scope is null or c.carteira_id=any(scope)))) then raise exception 'Carteira não permitida.' using errcode='42501'; end if;
  hash:=md5(jsonb_build_array(p_operador,lower(trim(p_administradora)),ids,p_montar,p_versao,p_ativacao)::text);
  select * into pedido from public.easy_maestro_pedidos where lote_id=p_lote;
  if found then
    if pedido.operador_id<>p_operador or pedido.intencao_hash<>hash then raise exception 'O lote pertence a outra intenção.'; end if;
    return pedido.criadas;
  end if;
  efeitos:=public.easy_maestro_efeitos(p_operador,p_administradora,ids,p_montar);
  if p_versao is distinct from efeitos->>'versao' or p_ativacao is distinct from (efeitos->>'ativacaoAutomatica')::boolean then raise exception 'Os efeitos ou a configuração mudaram. Confira novamente antes de captar.'; end if;
  insert into public.easy_maestro_pedidos(lote_id,operador_id,administradora,condominio_ids,montar_flow,ativacao_autorizada,config_versao,intencao_hash)
    values(p_lote,p_operador,lower(trim(p_administradora)),ids,coalesce(p_montar,false),coalesce(p_ativacao,false),p_versao,hash);
  v_criadas:=public.easy_maestro_captar(scope,lower(trim(p_administradora)),p_operador,p_lote,p_montar,ids);
  update public.easy_maestro_pedidos set criadas=v_criadas where lote_id=p_lote;
  return v_criadas;
end $$;

create function public.easy_maestro_validar_execucao(p_execucao uuid,p_auto boolean default false)
returns void language plpgsql security invoker set search_path='' as $$
declare e public.agente_execucoes; p public.easy_maestro_pedidos; efeitos jsonb;
begin
  select * into strict e from public.agente_execucoes where id=p_execucao;
  if e.easy_maestro_lote_id is null then return; end if;
  -- Serializa a leitura do consentimento com edições concorrentes, inclusive
  -- a inserção de uma nova regra ou template ainda ausente no snapshot.
  lock table public.profiles,public.usuarios_carteiras,public.condominios,
    public.agente_receitas,public.maestro_flow_controle,public.automacao_controle,
    public.reguas,public.regua_etapas,public.mensagens_templates in share mode;
  select * into p from public.easy_maestro_pedidos where lote_id=e.easy_maestro_lote_id;
  if not found or p.operador_id is distinct from e.solicitado_por or not(e.condominio_id=any(p.condominio_ids)) then raise exception 'Pedido Easy sem consentimento registrado. Revisão obrigatória.'; end if;
  efeitos:=public.easy_maestro_efeitos(p.operador_id,p.administradora,p.condominio_ids,p.montar_flow);
  if p.config_versao is distinct from efeitos->>'versao' or (p_auto and (not p.montar_flow or not p.ativacao_autorizada)) then raise exception 'Configuração ou efeito não autorizado. Confira o pedido Easy.'; end if;
end $$;

create function public.easy_maestro_guardar_execucao() returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.easy_maestro_lote_id is null then return new; end if;
  if tg_op='INSERT' then
    if not exists(select 1 from public.easy_maestro_pedidos p where p.lote_id=new.easy_maestro_lote_id and p.operador_id=new.solicitado_por
      and new.condominio_id=any(p.condominio_ids) and p.montar_flow=new.easy_maestro_montar_flow) then raise exception 'Pedido Easy exige conferência de efeitos e consentimento.'; end if;
  else
    if (new.receita_id,new.condominio_id,new.carteira_id,new.easy_maestro_lote_id,new.easy_maestro_montar_flow,new.solicitado_por)
      is distinct from (old.receita_id,old.condominio_id,old.carteira_id,old.easy_maestro_lote_id,old.easy_maestro_montar_flow,old.solicitado_por) then raise exception 'Identidade e efeitos do pedido Easy são imutáveis.'; end if;
    if new.status='em_execucao' and old.status is distinct from new.status then perform public.easy_maestro_validar_execucao(new.id,false); end if;
  end if;
  return new;
end $$;
create trigger easy_maestro_execucao_guard before insert or update on public.agente_execucoes for each row execute function public.easy_maestro_guardar_execucao();

create function public.easy_maestro_validar_montagem(p_job uuid)
returns void language plpgsql security invoker set search_path='' as $$
declare j public.maestro_flow_montagens; e public.agente_execucoes;
begin
  select * into strict j from public.maestro_flow_montagens where id=p_job;
  select * into strict e from public.agente_execucoes where id=j.execucao_id;
  if e.easy_maestro_lote_id is null then return; end if;
  perform public.easy_maestro_validar_execucao(e.id,false);
  if not exists(select 1 from public.easy_maestro_pedidos p where p.lote_id=e.easy_maestro_lote_id and p.montar_flow) then raise exception 'Montagem não autorizada neste pedido.'; end if;
end $$;

do $$declare nome text; fonte text; ancora text:=E'\r?\n[ \t]*begin[ \t]*\r?\n'; begin
  foreach nome in array array['public.maestro_flow_lote(uuid,uuid)','public.maestro_flow_finalizar(uuid,uuid,text)'] loop
    fonte:=pg_get_functiondef(nome::regprocedure);
    if fonte !~* ancora then raise exception 'Montagem fora da versão esperada: %',nome; end if;
    execute regexp_replace(fonte,ancora,E'\nbegin\n perform public.easy_maestro_validar_montagem(p_job);\n','i');
  end loop;
  fonte:=pg_get_functiondef('public.maestro_flow_ativar(uuid,text)'::regprocedure);
  if position('FUNCTION public.maestro_flow_ativar(' in fonte)=0 then raise exception 'Ativador Maestro incompatível.'; end if;
  execute replace(fonte,'FUNCTION public.maestro_flow_ativar(','FUNCTION public.maestro_flow_ativar_sem_easy_p1(');
end $$;

create or replace function public.maestro_flow_enfileirar_ativacao() returns trigger language plpgsql security definer set search_path='' as $$
declare execucao uuid;
begin
  if new.payload->>'origem'='easy_maestro' then
    select m.execucao_id into execucao from public.maestro_flow_montagens m where m.id::text=new.payload->>'montagem_id';
    begin perform public.easy_maestro_validar_execucao(execucao,true); exception when others then return new; end;
  end if;
  if new.payload->>'origem' in ('maestro','easy_maestro') and new.status='pronto' and new.total_mensagens>0
    and exists(select 1 from public.maestro_flow_controle where carteira_id=new.carteira_id and ativo) then
    insert into public.maestro_flow_ativacoes(flow_id,carteira_id) values(new.id,new.carteira_id) on conflict(flow_id) do nothing;
  end if;
  return new;
end $$;
create or replace function public.maestro_flow_ativar(p_flow uuid,p_remetente text) returns text language plpgsql security invoker set search_path='' as $$
declare f public.cobranca_flows; execucao uuid;
begin
  select * into strict f from public.cobranca_flows where id=p_flow for update;
  if f.payload->>'origem'='easy_maestro' then
    select m.execucao_id into execucao from public.maestro_flow_montagens m where m.id::text=f.payload->>'montagem_id';
    begin perform public.easy_maestro_validar_execucao(execucao,true);
    exception when others then update public.maestro_flow_ativacoes set status='manual',erro='Pedido Easy exige revisão de consentimento/configuração.',updated_at=now() where flow_id=f.id; return 'manual'; end;
  end if;
  return public.maestro_flow_ativar_sem_easy_p1(p_flow,p_remetente);
end $$;

do $$declare f record; begin
  for f in select p.oid::regprocedure assinatura from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'
    and (p.proname like 'easy_maestro_%' or p.proname in ('maestro_flow_ativar_sem_easy_p1','maestro_flow_ativar','maestro_flow_enfileirar_ativacao')) loop
    execute format('revoke all on function %s from public,anon,authenticated',f.assinatura);
    execute format('grant execute on function %s to service_role',f.assinatura);
  end loop;
end $$;
notify pgrst,'reload schema';
commit;
