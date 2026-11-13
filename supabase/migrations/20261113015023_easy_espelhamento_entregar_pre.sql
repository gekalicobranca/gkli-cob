begin;

alter table public.condominios add column easy_espelhamento_agendado boolean not null default false;
alter table public.easy_espelhamentos add column data_agendada date;
create unique index easy_espelhamento_agenda_unica on public.easy_espelhamentos(condominio_id,data_agendada) where data_agendada is not null;

create function public.easy_espelhamento_agendar(p_usuario uuid)
returns integer language plpgsql security invoker set search_path='' as $$
declare hoje date:=(now() at time zone 'America/Sao_Paulo')::date; total integer;
begin
  if not exists(select 1 from public.profiles p where p.id=p_usuario and p.role in ('admin','gestor')) then
    raise exception 'Operador do agendamento indisponível.';
  end if;
  insert into public.easy_espelhamentos(lote,condominio_id,carteira_id,solicitado_por,aplicar,data_agendada,administradora)
    select gen_random_uuid(),c.id,c.carteira_id,p_usuario,false,hoje,alvo.administradora
    from public.condominios c
    join (select r.condominio_id,min(r.administradora) administradora from public.easy_espelhamento_receitas(null) r
          group by r.condominio_id having count(distinct r.administradora)=1) alvo on c.id=alvo.condominio_id
    where c.easy_espelhamento_agendado and c.vencimento_cota_dia between 1 and 31
      and extract(day from hoje)=least(c.vencimento_cota_dia,extract(day from (date_trunc('month',hoje)+interval '1 month - 1 day')))
      and not exists(select 1 from public.easy_espelhamentos e where e.condominio_id=c.id and e.estado in ('fila','processando'))
    on conflict do nothing;
  get diagnostics total=row_count;
  return total;
end;
$$;
revoke all on function public.easy_espelhamento_agendar(uuid) from public,anon,authenticated;
grant execute on function public.easy_espelhamento_agendar(uuid) to service_role;

create table public.pre_juridico_caso_cotas_espelho (
  caso_id uuid not null references public.pre_juridico_casos(id),
  cobranca_id uuid not null references public.cobrancas(id),
  espelhamento_id uuid not null references public.easy_espelhamentos(id),
  recibo text not null,
  data_base date not null,
  evidencia jsonb not null,
  primary key (caso_id, cobranca_id)
);
alter table public.pre_juridico_caso_cotas_espelho enable row level security;
revoke all on public.pre_juridico_caso_cotas_espelho from public, anon, authenticated;
grant select, insert on public.pre_juridico_caso_cotas_espelho to service_role;
grant select(caso_id,cobranca_id) on public.pre_juridico_caso_cotas_espelho to authenticated;
create policy pre_juridico_espelho_leitura on public.pre_juridico_caso_cotas_espelho for select to authenticated
  using (exists(select 1 from public.pre_juridico_casos c where c.id=caso_id and public.current_user_can_access_carteira(c.carteira_id)));

create function public.easy_espelhamento_entregar_pre(p_execucao uuid, p_unidade uuid, p_usuario uuid)
returns uuid language plpgsql security invoker set search_path='' as $$
declare
  execucao public.easy_espelhamentos%rowtype;
  condominio public.condominios%rowtype;
  unidade public.unidades%rowtype;
  caso public.pre_juridico_casos%rowtype;
  plano jsonb;
  item jsonb;
  cota public.cobrancas%rowtype;
  vencidas uuid[] := '{}';
  encaminhadas uuid[] := '{}';
  hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  data_base date;
  prazo integer;
  garantia boolean;
begin
  select * into strict execucao from public.easy_espelhamentos
    where id=p_execucao and estado='concluido' for update;
  select * into strict condominio from public.condominios where id=execucao.condominio_id
    and carteira_id=execucao.carteira_id and status='ativo' and pre_juridico_habilitado;
  if not exists(select 1 from public.carteiras ct where ct.id=execucao.carteira_id and ct.pre_juridico_habilitado) then
    raise exception 'Pré-Jurídico desabilitado na carteira.';
  end if;
  if exists(select 1 from public.easy_espelhamentos e where e.condominio_id=execucao.condominio_id
      and e.id<>execucao.id and e.estado='concluido' and e.criado_em>execucao.criado_em) then
    raise exception 'Use a conferência mais recente do condomínio.';
  end if;
  select * into strict unidade from public.unidades where id=p_unidade and condominio_id=execucao.condominio_id
    and carteira_id=execucao.carteira_id for update;
  if unidade.acao_judicial or nullif(trim(unidade.numero_processo),'') is not null
    or unidade.conducao_processo in ('nosso_escritorio','outro_advogado')
    or exists(select 1 from public.acordos a where a.unidade_id=unidade.id and a.tipo='judicial') then
    raise exception 'Unidade exige revisão jurídica.';
  end if;
  select j into strict plano from jsonb_array_elements(execucao.resultado->'preJuridico'->'unidades') j
    where j->>'unidadeId'=p_unidade::text and j->>'exigeRevisaoVinculo'='false';
  data_base := (execucao.resultado->'preJuridico'->>'dataBase')::date;
  prazo := coalesce(condominio.inicio_cobranca_dias,0)+coalesce(condominio.dias_cobranca_ativa,60);
  if data_base is distinct from hoje or prazo is distinct from (execucao.resultado->'preJuridico'->>'prazoDias')::integer then
    raise exception 'Refaça a conferência para validar a data-base e a régua atual.';
  end if;

  select * into caso from public.pre_juridico_casos where unidade_id=p_unidade for update;
  if caso.id is not null and caso.etapa <> 'aguardando_documentos' then
    raise exception 'O caso já avançou. Revise os recibos no módulo Pré-Jurídico.';
  end if;

  for item in select value from jsonb_array_elements(plano->'comprovacaoMinimo') order by value->>'id' loop
    select * into strict cota from public.cobrancas c where c.id=(item->>'id')::uuid
      and c.unidade_id=p_unidade and c.condominio_id=execucao.condominio_id and c.carteira_id=execucao.carteira_id
      and c.arquivada_em is null and c.duplicada_de_id is null and c.duplicidade_arquivada_em is null
      and not coalesce(c.excluida_por_cessao_espaco,false) for update;
    garantia := coalesce(condominio.bloqueio_garantidora_habilitado and cota.vencimento between condominio.bloqueio_garantidora_inicio and condominio.bloqueio_garantidora_fim,false);
    if cota.vencimento is distinct from (item->>'vencimento')::date or cota.vencimento>=data_base
      or public.cobranca_recibo_arquivo(cota.observacoes) is distinct from item->>'recibo'
      or cota.data_pagamento is not null or cota.status_financeiro not in ('em_aberto','vencido','parcial')
      or cota.status_operacional in ('acordo_firmado','acordo_efetivado','acordo_quebrado','suspenso','judicializado')
      or garantia
      or exists(select 1 from public.acordos a where a.cobranca_id=cota.id and a.status not in ('cancelado','renegociado'))
      or exists(select 1 from public.acordo_cobrancas v join public.acordos a on a.id=v.acordo_id
        where v.cobranca_id=cota.id and a.status not in ('cancelado','renegociado')) then
      raise exception 'Uma cota mudou desde a conferência. Refaça o espelhamento.';
    end if;
    if cota.id=any(vencidas) then raise exception 'Cota repetida no dossiê.'; end if;
    vencidas := array_append(vencidas,cota.id);
  end loop;
  if cardinality(vencidas)<2 then raise exception 'São necessárias duas cotas vencidas em aberto.'; end if;

  for item in select value from jsonb_array_elements(plano->'cotas') loop
    if not (item->>'id')::uuid=any(vencidas) or data_base-(item->>'vencimento')::date<prazo then
      raise exception 'Cota fora do recorte de encaminhamento.';
    end if;
    select * into strict cota from public.cobrancas where id=(item->>'id')::uuid;
    if cota.status_operacional not in ('novo','em_cobranca_ativa','em_negociacao','possivel_acordo')
      and not exists(select 1 from public.pre_juridico_caso_cotas_espelho v where v.caso_id=caso.id and v.cobranca_id=cota.id) then
      raise exception 'Status operacional mudou desde a conferência.';
    end if;
    encaminhadas := array_append(encaminhadas,cota.id);
  end loop;
  if cardinality(encaminhadas)=0 then raise exception 'Nenhuma cota atingiu o prazo.'; end if;
  if caso.id is null then
    insert into public.pre_juridico_casos(carteira_id,condominio_id,unidade_id,cobranca_id,responsavel_id,etapa)
      values(execucao.carteira_id,execucao.condominio_id,p_unidade,encaminhadas[1],p_usuario,'aguardando_documentos')
      returning * into caso;
  elsif not exists(select 1 from public.pre_juridico_caso_cotas_espelho v where v.caso_id=caso.id) then
    raise exception 'Já existe um caso com escopo manual para esta unidade.';
  end if;

  for item in select value from jsonb_array_elements(plano->'cotas') loop
    insert into public.pre_juridico_caso_cotas_espelho(caso_id,cobranca_id,espelhamento_id,recibo,data_base,evidencia)
      values(caso.id,(item->>'id')::uuid,p_execucao,item->>'recibo',data_base,item)
      on conflict (caso_id,cobranca_id) do nothing;
    if found then
      select * into strict cota from public.cobrancas where id=(item->>'id')::uuid;
      update public.cobrancas set status='pre_juridico',status_operacional='pre_juridico',automacao_bloqueada=true,
        proxima_acao_em=null where id=cota.id;
      insert into public.auditoria_eventos(carteira_id,entidade_tipo,entidade_id,evento_tipo,titulo,usuario_id,antes,depois)
        values(execucao.carteira_id,'cobranca',cota.id,'espelhamento_pre_juridico','Encaminhada pelo espelhamento',p_usuario,
          jsonb_build_object('status_operacional',cota.status_operacional),
          jsonb_build_object('status_operacional','pre_juridico','caso_id',caso.id,'espelhamento_id',p_execucao,'recibo',item->>'recibo'));
    end if;
  end loop;
  return caso.id;
end;
$$;
revoke all on function public.easy_espelhamento_entregar_pre(uuid,uuid,uuid) from public, anon, authenticated;
grant execute on function public.easy_espelhamento_entregar_pre(uuid,uuid,uuid) to service_role;

create function public.easy_espelhamento_aplicar_contato(p_execucao uuid, p_unidade uuid, p_usuario uuid)
returns void language plpgsql security invoker set search_path='' as $$
declare
  execucao public.easy_espelhamentos%rowtype;
  unidade public.unidades%rowtype;
  proposta jsonb;
  depois jsonb;
begin
  select * into strict execucao from public.easy_espelhamentos where id=p_execucao and estado='concluido' for update;
  select * into strict unidade from public.unidades where id=p_unidade and condominio_id=execucao.condominio_id
    and carteira_id=execucao.carteira_id for update;
  select j into strict proposta from jsonb_array_elements(execucao.resultado->'contatosEFlows'->'revisoes') j
    where j->>'unidadeId'=p_unidade::text and j->>'revisao' is not null;
  depois:=proposta->'depois';
  if (proposta->>'consultadoEm')::timestamptz is null or (proposta->>'consultadoEm')::timestamptz < now()-interval '24 hours'
    or exists(select 1 from public.easy_espelhamentos e where e.condominio_id=execucao.condominio_id
      and e.estado='concluido' and e.criado_em>execucao.criado_em) then
    raise exception 'Use uma ficha recente na última conferência do condomínio.';
  end if;
  if (not depois ? 'email' or unidade.email is not distinct from depois->>'email')
    and (not depois ? 'telefone' or unidade.telefone is not distinct from depois->>'telefone')
    and (not depois ? 'responsavel_nome' or unidade.responsavel_nome is not distinct from depois->>'responsavel_nome') then return; end if;
  if unidade.updated_at is distinct from (proposta->>'revisao')::timestamptz then
    raise exception 'O cadastro mudou. Refaça a conferência antes de atualizar o contato.';
  end if;
  update public.unidades set email=coalesce(depois->>'email',email), telefone=coalesce(depois->>'telefone',telefone),
    responsavel_nome=coalesce(depois->>'responsavel_nome',responsavel_nome) where id=unidade.id;
  insert into public.auditoria_eventos(carteira_id,entidade_tipo,entidade_id,evento_tipo,titulo,usuario_id,antes,depois)
    values(execucao.carteira_id,'unidade',unidade.id,'espelhamento_contato','Contato conferido na Lello',p_usuario,
      proposta->'antes',depois||jsonb_build_object('espelhamento_id',execucao.id,'consultadoEm',proposta->>'consultadoEm'));
end;
$$;
revoke all on function public.easy_espelhamento_aplicar_contato(uuid,uuid,uuid) from public, anon, authenticated;
grant execute on function public.easy_espelhamento_aplicar_contato(uuid,uuid,uuid) to service_role;

create table public.easy_espelhamento_flows (
  condominio_id uuid not null references public.condominios(id),
  unidade_id uuid not null references public.unidades(id),
  canal text not null check (canal in ('email','whatsapp')),
  espelhamento_id uuid not null references public.easy_espelhamentos(id),
  solicitado_em timestamptz not null default now(),
  flow_ids uuid[] not null default '{}',
  primary key (espelhamento_id,unidade_id,canal)
);
alter table public.easy_espelhamento_flows enable row level security;
revoke all on public.easy_espelhamento_flows from public, anon, authenticated;
grant select, insert, update, delete on public.easy_espelhamento_flows to service_role;
create unique index easy_espelhamento_flow_unidade_em_montagem
  on public.easy_espelhamento_flows(unidade_id,canal) where cardinality(flow_ids)=0;

create table public.easy_espelhamento_borderos_aprovados (
  periodo_id uuid not null references public.fechamento_periodos(id),
  condominio_id uuid not null references public.condominios(id),
  carteira_id uuid not null references public.carteiras(id),
  espelhamento_id uuid not null references public.easy_espelhamentos(id),
  aprovado_por uuid not null,
  aprovado_em timestamptz not null default now(),
  total_centavos bigint not null check (total_centavos>0),
  descricao text not null,
  primary key (periodo_id,condominio_id)
);
create table public.easy_espelhamento_bordero_parcelas (
  parcela_id uuid primary key references public.parcelas_acordo(id),
  periodo_id uuid not null,
  condominio_id uuid not null,
  linha jsonb not null,
  foreign key (periodo_id,condominio_id) references public.easy_espelhamento_borderos_aprovados(periodo_id,condominio_id)
);
alter table public.easy_espelhamento_borderos_aprovados enable row level security;
alter table public.easy_espelhamento_bordero_parcelas enable row level security;
revoke all on public.easy_espelhamento_borderos_aprovados,public.easy_espelhamento_bordero_parcelas from public,anon,authenticated;
grant select,insert on public.easy_espelhamento_borderos_aprovados,public.easy_espelhamento_bordero_parcelas to service_role;
grant select on public.easy_espelhamento_borderos_aprovados to authenticated;
create policy easy_bordero_leitura on public.easy_espelhamento_borderos_aprovados for select to authenticated
  using (public.current_user_can_access_carteira(carteira_id));

create function public.easy_espelhamento_aprovar_bordero(p_execucao uuid, p_usuario uuid, p_fim date)
returns uuid language plpgsql security invoker set search_path='' as $$
declare
  espelho public.easy_espelhamentos%rowtype;
  periodo public.fechamento_periodos%rowtype;
  anterior public.easy_espelhamento_borderos_aprovados%rowtype;
  bordero jsonb;
  linha jsonb;
  total bigint;
  descricao text;
begin
  select * into strict espelho from public.easy_espelhamentos where id=p_execucao and estado='concluido';
  if espelho.resultado->'bordero'->>'fim'=p_fim::text then bordero:=espelho.resultado->'bordero';
  elsif espelho.resultado->'borderoAnterior'->>'fim'=p_fim::text then bordero:=espelho.resultado->'borderoAnterior'; end if;
  if coalesce(jsonb_array_length(bordero->'linhas'),0)=0 then raise exception 'A prévia não contém parcelas faturáveis.'; end if;
  select * into strict periodo from public.fechamento_periodos where id=(bordero->>'periodoId')::uuid
    and data_abertura=(bordero->>'inicio')::date and data_fechamento=(bordero->>'fim')::date and status='fechado' for update;
  select * into anterior from public.easy_espelhamento_borderos_aprovados where periodo_id=periodo.id and condominio_id=espelho.condominio_id;
  if anterior.espelhamento_id=p_execucao then return periodo.id; end if;
  if anterior.espelhamento_id is not null or exists(select 1 from public.fiscal_core_envios e where e.periodo_id=periodo.id
    and e.condominio_id=espelho.condominio_id and (e.payload is not null or e.status='processando')) then
    raise exception 'O fechamento já tem uma versão fiscal. Revise o ajuste no fechamento.';
  end if;
  if (now() at time zone 'America/Sao_Paulo')::date<periodo.data_fechamento
    or coalesce((espelho.resultado->'preJuridico'->>'dataBase')::date, '-infinity'::date)<periodo.data_fechamento
    or exists(select 1 from public.easy_espelhamentos e where e.condominio_id=espelho.condominio_id and e.estado='concluido' and e.criado_em>espelho.criado_em) then
    raise exception 'Use a conferência final mais recente do ciclo.';
  end if;
  select sum((j->>'repasseCentavos')::bigint),string_agg(j->>'descricao',E'\n' order by j->>'unidade',(j->>'parcela')::integer)
    into total,descricao from jsonb_array_elements(bordero->'linhas') j;
  if coalesce(total,0)<=0 or total is distinct from (bordero->>'totalCentavos')::bigint
    or (select count(*) from public.fechamento_faturamentos_omie f where f.periodo_id=periodo.id and f.condominio_id=espelho.condominio_id
      and f.carteira_id=espelho.carteira_id and f.status='pendente' and f.valor_faturamento>0)<>1
    or not exists(select 1 from public.fechamento_faturamentos_omie f where f.periodo_id=periodo.id and f.condominio_id=espelho.condominio_id
      and f.carteira_id=espelho.carteira_id and f.tipo_faturamento='repasse_cobranca_extrajudicial' and f.status='pendente' and f.valor_faturamento=total/100.0) then
    raise exception 'O total do borderô diverge da base fiscal do fechamento.';
  end if;
  insert into public.easy_espelhamento_borderos_aprovados(periodo_id,condominio_id,carteira_id,espelhamento_id,aprovado_por,total_centavos,descricao)
    values(periodo.id,espelho.condominio_id,espelho.carteira_id,p_execucao,p_usuario,total,descricao);
  for linha in select value from jsonb_array_elements(bordero->'linhas') loop
    perform 1 from public.parcelas_acordo p join public.acordos a on a.id=p.acordo_id where p.id=(linha->>'parcelaId')::uuid
      and p.acordo_id=(linha->>'acordoId')::uuid and a.condominio_id=espelho.condominio_id and a.carteira_id=espelho.carteira_id
      and a.origem_controle='carteira' and a.tipo is distinct from 'judicial' and a.status not in ('cancelado','renegociado','quebrado')
      and p.status='paga' and p.data_pagamento=(linha->>'dataBaixa')::date and p.valor=(linha->>'valorPagoCentavos')::numeric/100 for update of p;
    if not found then raise exception 'Uma baixa mudou. Refaça o borderô antes da aprovação.'; end if;
    insert into public.easy_espelhamento_bordero_parcelas(parcela_id,periodo_id,condominio_id,linha)
      values((linha->>'parcelaId')::uuid,periodo.id,espelho.condominio_id,linha);
  end loop;
  return periodo.id;
end;
$$;
revoke all on function public.easy_espelhamento_aprovar_bordero(uuid,uuid,date) from public,anon,authenticated;
grant execute on function public.easy_espelhamento_aprovar_bordero(uuid,uuid,date) to service_role;

create or replace function public.sincronizar_judicializacao_pre_juridico()
returns trigger language plpgsql set search_path='' as $$
begin
  if ((new.distribuicao_status='distribuido' and old.distribuicao_status is distinct from new.distribuicao_status)
      or (new.etapa='judicializado' and old.etapa is distinct from new.etapa)) and new.unidade_id is not null then
    update public.unidades set acao_judicial=true where id=new.unidade_id;
    update public.cobrancas c set status='judicializado',status_operacional='judicializado'
      where c.unidade_id=new.unidade_id and c.duplicada_de_id is null
        and lower(coalesce(c.status_financeiro,'')) not in ('quitado','pago','cancelado')
        and ((not exists(select 1 from public.pre_juridico_caso_cotas_espelho v where v.caso_id=new.id)
            and (c.id=new.cobranca_id or coalesce(c.status_operacional,c.status) in ('pre_distribuicao','pre_juridico')))
          or (c.arquivada_em is null and c.duplicada_de_id is null and c.duplicidade_arquivada_em is null
            and not coalesce(c.excluida_por_cessao_espaco,false) and c.data_pagamento is null
            and c.status_financeiro in ('em_aberto','vencido','parcial') and c.status_operacional='pre_juridico'
            and exists(select 1 from public.pre_juridico_caso_cotas_espelho v where v.caso_id=new.id and v.cobranca_id=c.id)));
  end if;
  return new;
end;
$$;

-- A distribuição usa o gatilho existente e a política de acesso da própria carteira.
grant select on public.pre_juridico_caso_cotas_espelho to authenticated;
create policy pre_caso_cotas_espelho_leitura on public.pre_juridico_caso_cotas_espelho for select to authenticated
  using (exists(select 1 from public.pre_juridico_casos p where p.id=caso_id and public.current_user_can_access_carteira(p.carteira_id)));

create or replace function public.classificar_pre_distribuicao()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.duplicada_de_id is not null
    or coalesce(new.status_operacional,new.status) not in ('pre_distribuicao','pre_juridico')
    or coalesce(new.status_financeiro,'') in ('quitado','pago','cancelado','renegociado') then return new; end if;

  if exists(select 1 from public.pre_juridico_caso_cotas_espelho v join public.pre_juridico_casos p on p.id=v.caso_id
    where v.cobranca_id=new.id and p.unidade_id=new.unidade_id and p.carteira_id=new.carteira_id
      and p.condominio_id=new.condominio_id and p.etapa<>'judicializado') then
    new.status_operacional:='pre_juridico'; new.status:='pre_juridico'; return new;
  end if;
  if exists(select 1 from public.acordos a where a.cobranca_id=new.id)
    or exists(select 1 from public.acordo_cobrancas a where a.cobranca_id=new.id) then
    if new.status_operacional='pre_distribuicao' then raise exception 'Pré-distribuição é destinado a cobranças sem acordo.'; end if;
    return new;
  end if;
  new.status_operacional:=case when exists(select 1 from public.pre_juridico_casos p where p.carteira_id=new.carteira_id
    and p.condominio_id=new.condominio_id and p.unidade_id=new.unidade_id
    and p.etapa not in ('encerrado','cancelado','arquivado','judicializado')
    and p.procuracao_status in ('gerada','enviada','assinada') and p.certidao_status in ('solicitada','recebida')
    and not exists(select 1 from public.pre_juridico_caso_cotas_espelho v where v.caso_id=p.id))
    then 'pre_juridico' else 'pre_distribuicao' end;
  new.status:=new.status_operacional;
  return new;
end;
$$;

create or replace function public.sincronizar_documentos_pre_distribuicao()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.etapa='judicializado' then return new; end if;
  update public.cobrancas c set status=c.status_operacional
    where c.carteira_id=new.carteira_id and c.condominio_id=new.condominio_id and c.unidade_id=new.unidade_id
      and c.duplicada_de_id is null and c.status_operacional in ('pre_distribuicao','pre_juridico')
      and not exists(select 1 from public.acordos a where a.cobranca_id=c.id)
      and not exists(select 1 from public.acordo_cobrancas a where a.cobranca_id=c.id)
      and (not exists(select 1 from public.pre_juridico_caso_cotas_espelho v where v.caso_id=new.id)
        or exists(select 1 from public.pre_juridico_caso_cotas_espelho v where v.caso_id=new.id and v.cobranca_id=c.id));
  return new;
end;
$$;

notify pgrst, 'reload schema';
commit;
