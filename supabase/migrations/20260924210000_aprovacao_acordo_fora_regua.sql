begin;

-- A decisão fica separada da fila genérica: resolver uma pendência não aprova um acordo.
create table public.acordos_aprovacoes_fora_regua (
  id uuid primary key default gen_random_uuid(),
  carteira_id uuid not null references public.carteiras(id),
  condominio_id uuid not null references public.condominios(id),
  unidade_id uuid not null references public.unidades(id),
  pendencia_id uuid references public.central_pendencias(id),
  proposta jsonb not null,
  formulario jsonb not null,
  recibos_fora_regua jsonb not null,
  status text not null default 'pendente' check (status in ('pendente', 'aprovada', 'rejeitada')),
  solicitado_por uuid not null references public.profiles(id),
  decidido_por uuid references public.profiles(id),
  decidido_em timestamptz,
  justificativa text,
  acordo_id uuid references public.acordos(id) on delete set null,
  created_at timestamptz not null default now()
);
create unique index acordos_aprovacoes_fora_regua_proposta_idx
  on public.acordos_aprovacoes_fora_regua(unidade_id, md5(proposta::text));
alter table public.acordos_aprovacoes_fora_regua enable row level security;
create policy acordos_aprovacoes_fora_regua_select on public.acordos_aprovacoes_fora_regua
  for select to authenticated using (public.current_user_can_access_carteira(carteira_id));
revoke all on public.acordos_aprovacoes_fora_regua from public, anon, authenticated;
grant select on public.acordos_aprovacoes_fora_regua to authenticated;

create function public.normalizar_proposta_fora_regua(p_proposta jsonb)
returns jsonb language sql immutable set search_path = public as $$
  select jsonb_build_object(
    'tipo', p_proposta->'tipo', 'numero_processo', p_proposta->'numero_processo',
    'valor_acordado', p_proposta->'valor_acordado', 'entrada', p_proposta->'entrada',
    'despesa_cobranca_percentual', p_proposta->'despesa_cobranca_percentual',
    'despesa_cobranca_valor', p_proposta->'despesa_cobranca_valor',
    'itens', (select jsonb_agg(i order by i->>'cobranca_id') from jsonb_array_elements(p_proposta->'itens') i),
    'parcelas', (select jsonb_agg(p order by (p->>'numero')::int) from jsonb_array_elements(p_proposta->'parcelas') p)
  );
$$;

create function public.solicitar_aprovacao_acordo_fora_regua(
  p_carteira_id uuid, p_condominio_id uuid, p_unidade_id uuid, p_cobranca_id uuid,
  p_proposta jsonb, p_formulario jsonb
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_proposta jsonb := public.normalizar_proposta_fora_regua(p_proposta);
  v_fora jsonb;
  v_row public.acordos_aprovacoes_fora_regua;
  v_pendencia uuid;
  v_contexto text;
begin
  if auth.uid() is null or public.current_user_can_access_carteira(p_carteira_id) is not true
    or not exists(select 1 from profiles where id=auth.uid() and role in ('admin','gestor','operador'))
    then raise exception 'Sem permissão para solicitar aprovação nesta carteira.'; end if;
  if jsonb_typeof(v_proposta->'itens') is distinct from 'array'
    or jsonb_array_length(v_proposta->'itens')=0
    or not exists(select 1 from jsonb_array_elements(v_proposta->'itens') i where (i->>'cobranca_id')::uuid=p_cobranca_id)
    then raise exception 'Selecione os recibos da proposta.'; end if;
  if exists (
    select 1 from jsonb_to_recordset(v_proposta->'itens') i(cobranca_id uuid)
    left join cobrancas c on c.id=i.cobranca_id
    where c.id is null or c.duplicada_de_id is not null or c.carteira_id is distinct from p_carteira_id
      or c.condominio_id is distinct from p_condominio_id or c.unidade_id is distinct from p_unidade_id
  ) then raise exception 'Recibos indisponíveis para esta unidade.'; end if;

  -- Serializa solicitações repetidas para a mesma unidade, inclusive cliques concorrentes.
  perform pg_advisory_xact_lock(hashtextextended(p_unidade_id::text, 9242026));
  select * into v_row from acordos_aprovacoes_fora_regua
    where unidade_id=p_unidade_id and proposta=v_proposta;
  if found then
    return jsonb_build_object('id',v_row.id,'status',v_row.status,'acordo_id',v_row.acordo_id);
  end if;
  select jsonb_agg(jsonb_build_object('id',c.id,'vencimento',c.vencimento,
      'valor',coalesce(nullif(c.valor_atualizado,0),c.valor_original),
      'inicio_cobranca_dias',coalesce(cd.inicio_cobranca_dias,0)) order by c.vencimento,c.id)
    into v_fora
    from cobrancas c join condominios cd on cd.id=c.condominio_id
    where c.id in (select (i->>'cobranca_id')::uuid from jsonb_array_elements(v_proposta->'itens') i)
      and (now() at time zone 'America/Sao_Paulo')::date-c.vencimento::date < greatest(0,coalesce(cd.inicio_cobranca_dias,0));
  if v_fora is null then return null; end if;

  select concat(cd.nome, ' · Unidade ',u.identificacao,coalesce(' · Bloco '||u.bloco,'')) into v_contexto
    from condominios cd join unidades u on u.condominio_id=cd.id where u.id=p_unidade_id;
  insert into acordos_aprovacoes_fora_regua(carteira_id,condominio_id,unidade_id,proposta,formulario,recibos_fora_regua,solicitado_por)
    values(p_carteira_id,p_condominio_id,p_unidade_id,v_proposta,p_formulario,v_fora,auth.uid()) returning * into v_row;
  insert into central_pendencias(carteira_id,origem,tipo,status,prioridade,titulo,descricao,
    entidade_tipo,entidade_id,condominio_id,unidade_id,cobranca_id,payload)
    values(p_carteira_id,'acordo','aprovacao_acordo_fora_regua','aberta','alta',
      'Aprovar acordo com parcelas fora da régua',
      concat(v_contexto, '. ',jsonb_array_length(v_fora),' recibo(s) fora da régua. Total proposto: R$ ',
        v_proposta->>'valor_acordado','. Conferir a proposta antes da efetivação. Aprovação exclusiva do gestor/admin.'),
      'cobranca',p_cobranca_id,p_condominio_id,p_unidade_id,p_cobranca_id,
      jsonb_build_object('aprovacao_id',v_row.id,'recibos_fora_regua',v_fora)) returning id into v_pendencia;
  update acordos_aprovacoes_fora_regua set pendencia_id=v_pendencia where id=v_row.id;
  return jsonb_build_object('id',v_row.id,'status','pendente');
end;
$$;

create function public.decidir_aprovacao_acordo_fora_regua(p_id uuid,p_decisao text,p_justificativa text)
returns void language plpgsql security definer set search_path=public as $$
declare v_row public.acordos_aprovacoes_fora_regua;
begin
  if auth.uid() is null or not exists(select 1 from profiles where id=auth.uid() and role in ('admin','gestor'))
    then raise exception 'Somente gestor/admin pode aprovar ou rejeitar.'; end if;
  if p_decisao not in ('aprovada','rejeitada') or nullif(trim(p_justificativa),'') is null
    then raise exception 'Informe a decisão e a justificativa.'; end if;
  select * into v_row from acordos_aprovacoes_fora_regua where id=p_id for update;
  if not found or public.current_user_can_access_carteira(v_row.carteira_id) is not true
    then raise exception 'Proposta indisponível nesta carteira.'; end if;
  if v_row.status<>'pendente' or v_row.acordo_id is not null then raise exception 'Esta proposta já foi decidida.'; end if;
  update acordos_aprovacoes_fora_regua set status=p_decisao,decidido_por=auth.uid(),decidido_em=now(),
    justificativa=trim(p_justificativa) where id=p_id;
  update central_pendencias set status=case when p_decisao='aprovada' then 'resolvida' else 'cancelada' end,
    resolvido_em=now(),updated_at=now(),payload=payload||jsonb_build_object('decisao',p_decisao,
    'decidido_por',auth.uid(),'decidido_em',now(),'justificativa',trim(p_justificativa)) where id=v_row.pendencia_id;
end;
$$;

revoke all on function public.solicitar_aprovacao_acordo_fora_regua(uuid,uuid,uuid,uuid,jsonb,jsonb),
  public.decidir_aprovacao_acordo_fora_regua(uuid,text,text) from public,anon;
grant execute on function public.solicitar_aprovacao_acordo_fora_regua(uuid,uuid,uuid,uuid,jsonb,jsonb),
  public.decidir_aprovacao_acordo_fora_regua(uuid,text,text) to authenticated;

-- A criação financeira abaixo valida a mesma proposta e consome a aprovação na mesma transação.

CREATE OR REPLACE FUNCTION public.criar_acordo_financeiro(p_carteira_id uuid, p_cobranca_id uuid, p_condominio_id uuid, p_unidade_id uuid, p_tipo text, p_numero_processo text, p_valor_acordado numeric, p_entrada numeric, p_despesa_cobranca_percentual numeric, p_despesa_cobranca_valor numeric, p_data_acordo date, p_status text, p_fluxo_status text, p_exige_aprovacao_sindico boolean, p_documento_url text, p_observacoes text, p_itens jsonb, p_parcelas jsonb, p_cobranca_status text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_acordo_id uuid;
  v_aprovacao public.acordos_aprovacoes_fora_regua;
  v_proposta jsonb;
  v_itens_count integer;
  v_updated_count integer;
  v_status_check text;
  v_cobranca_status_legado text;
begin
  if auth.uid() is null or public.current_user_can_access_carteira(p_carteira_id) is not true
    or not exists(select 1 from profiles where id=auth.uid() and role in ('admin','gestor','operador'))
    then raise exception 'Sem permissão para criar acordo nesta carteira.'; end if;
  if p_carteira_id is null then
    raise exception 'Carteira obrigatoria.';
  end if;

  if p_cobranca_id is null then
    raise exception 'Cobranca principal obrigatoria.';
  end if;

  if jsonb_typeof(p_itens) is distinct from 'array' or jsonb_array_length(p_itens) = 0 then
    raise exception 'Itens de acordo obrigatorios.';
  end if;

  if jsonb_typeof(p_parcelas) is distinct from 'array' or jsonb_array_length(p_parcelas) = 0 then
    raise exception 'Parcelas de acordo obrigatorias.';
  end if;

  select count(*)
    into v_itens_count
  from jsonb_to_recordset(p_itens) as item(cobranca_id uuid);

  if exists (
    select 1
    from jsonb_to_recordset(p_itens) as item(cobranca_id uuid)
    left join public.cobrancas c on c.id = item.cobranca_id
    where c.id is null or c.duplicada_de_id is not null
      or c.carteira_id is distinct from p_carteira_id
      or c.condominio_id is distinct from p_condominio_id
      or c.unidade_id is distinct from p_unidade_id
  ) then
    raise exception 'As cobrancas do acordo precisam existir e pertencer a mesma carteira, condominio e unidade.';
  end if;

  if not exists(select 1 from jsonb_to_recordset(p_itens) i(cobranca_id uuid) where i.cobranca_id=p_cobranca_id)
    or v_itens_count <> (select count(distinct i.cobranca_id) from jsonb_to_recordset(p_itens) i(cobranca_id uuid))
    then raise exception 'Seleção de recibos inválida.'; end if;

  v_proposta := normalizar_proposta_fora_regua(jsonb_build_object(
    'tipo',p_tipo,'numero_processo',p_numero_processo,'valor_acordado',p_valor_acordado,
    'entrada',p_entrada,'despesa_cobranca_percentual',p_despesa_cobranca_percentual,
    'despesa_cobranca_valor',p_despesa_cobranca_valor,'itens',p_itens,'parcelas',p_parcelas));
  perform pg_advisory_xact_lock(hashtextextended(p_unidade_id::text,9242026));
  select * into v_aprovacao from acordos_aprovacoes_fora_regua
    where unidade_id=p_unidade_id and proposta=v_proposta for update;
  if v_aprovacao.id is not null or exists (
    select 1 from cobrancas c join condominios cd on cd.id=c.condominio_id
    where c.id in (select i.cobranca_id from jsonb_to_recordset(p_itens) i(cobranca_id uuid))
      and (now() at time zone 'America/Sao_Paulo')::date-c.vencimento::date < greatest(0,coalesce(cd.inicio_cobranca_dias,0))
  ) then
    if v_aprovacao.id is null or v_aprovacao.status<>'aprovada' or v_aprovacao.acordo_id is not null
      then raise exception 'A inclusão de parcelas fora da régua exige aprovação do gestor para esta proposta.'; end if;
  end if;

  select pg_get_constraintdef(oid)
    into v_status_check
  from pg_constraint
  where conrelid = 'public.cobrancas'::regclass
    and conname = 'cobrancas_status_check'
  limit 1;

  v_cobranca_status_legado := p_cobranca_status;

  if v_status_check is not null
     and v_status_check not ilike '%' || p_cobranca_status || '%'
     and v_status_check ilike '%' || replace(p_cobranca_status, '_', ' ') || '%'
  then
    v_cobranca_status_legado := replace(p_cobranca_status, '_', ' ');
  end if;

  perform 1
  from public.cobrancas c
  where c.id in (
    select item.cobranca_id
    from jsonb_to_recordset(p_itens) as item(cobranca_id uuid)
  )
  for update;

  insert into public.acordos (
    carteira_id,
    cobranca_id,
    condominio_id,
    unidade_id,
    tipo,
    numero_processo,
    valor_acordado,
    entrada,
    despesa_cobranca_percentual,
    despesa_cobranca_valor,
    data_acordo,
    status,
    fluxo_status,
    exige_aprovacao_sindico,
    documento_url,
    observacoes
  )
  values (
    p_carteira_id,
    p_cobranca_id,
    p_condominio_id,
    p_unidade_id,
    p_tipo,
    nullif(p_numero_processo, ''),
    p_valor_acordado,
    p_entrada,
    p_despesa_cobranca_percentual,
    p_despesa_cobranca_valor,
    p_data_acordo,
    p_status,
    p_fluxo_status,
    coalesce(p_exige_aprovacao_sindico, false),
    nullif(p_documento_url, ''),
    nullif(p_observacoes, '')
  )
  returning id into v_acordo_id;

  insert into public.acordo_cobrancas (
    acordo_id,
    cobranca_id,
    valor_original_no_acordo,
    valor_atualizado_no_acordo,
    encargos_no_acordo,
    valor_total_no_acordo
  )
  select
    v_acordo_id,
    item.cobranca_id,
    coalesce(item.valor_original_no_acordo, 0),
    coalesce(item.valor_atualizado_no_acordo, 0),
    coalesce(item.encargos_no_acordo, 0),
    coalesce(item.valor_total_no_acordo, 0)
  from jsonb_to_recordset(p_itens) as item(
    cobranca_id uuid,
    valor_original_no_acordo numeric,
    valor_atualizado_no_acordo numeric,
    encargos_no_acordo numeric,
    valor_total_no_acordo numeric
  );

  insert into public.parcelas_acordo (
    acordo_id,
    numero,
    tipo_parcela,
    valor,
    vencimento,
    status
  )
  select
    v_acordo_id,
    parcela.numero,
    coalesce(parcela.tipo_parcela, 'parcela'),
    parcela.valor,
    parcela.vencimento,
    coalesce(parcela.status, 'aberta')
  from jsonb_to_recordset(p_parcelas) as parcela(
    numero integer,
    tipo_parcela text,
    valor numeric,
    vencimento date,
    status text
  );

  update public.cobrancas c
     set status = v_cobranca_status_legado,
         status_operacional = p_cobranca_status
   where c.id in (
    select item.cobranca_id
    from jsonb_to_recordset(p_itens) as item(cobranca_id uuid)
  );

  get diagnostics v_updated_count = row_count;

  if v_updated_count <> v_itens_count then
    raise exception 'Nem todas as cobrancas do acordo foram atualizadas.';
  end if;

  if v_aprovacao.id is not null then
    update acordos_aprovacoes_fora_regua set acordo_id=v_acordo_id where id=v_aprovacao.id;
    update central_pendencias set acordo_id=v_acordo_id,updated_at=now() where id=v_aprovacao.pendencia_id;
  end if;
  return v_acordo_id;
end;
$function$
;

revoke all on function public.criar_acordo_financeiro(uuid,uuid,uuid,uuid,text,text,numeric,numeric,numeric,numeric,date,text,text,boolean,text,text,jsonb,jsonb,text) from public,anon;
grant execute on function public.criar_acordo_financeiro(uuid,uuid,uuid,uuid,text,text,numeric,numeric,numeric,numeric,date,text,text,boolean,text,text,jsonb,jsonb,text) to authenticated;
notify pgrst,'reload schema';
commit;
