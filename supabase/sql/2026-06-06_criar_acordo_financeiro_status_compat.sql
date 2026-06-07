-- Corrige compatibilidade entre status legado e status_operacional.
--
-- Algumas bases ainda possuem `cobrancas.status` com check constraint usando
-- valores legados com espaco, como `acordo firmado`, enquanto o app usa
-- `status_operacional = acordo_firmado` como fonte canonica.
--
-- A RPC passa a gravar:
-- - cobrancas.status_operacional = p_cobranca_status
-- - cobrancas.status = valor aceito pela constraint legada, quando necessario

create or replace function public.criar_acordo_financeiro(
  p_carteira_id uuid,
  p_cobranca_id uuid,
  p_condominio_id uuid,
  p_unidade_id uuid,
  p_tipo text,
  p_numero_processo text,
  p_valor_acordado numeric,
  p_entrada numeric,
  p_despesa_cobranca_percentual numeric,
  p_despesa_cobranca_valor numeric,
  p_data_acordo date,
  p_status text,
  p_fluxo_status text,
  p_exige_aprovacao_sindico boolean,
  p_documento_url text,
  p_observacoes text,
  p_itens jsonb,
  p_parcelas jsonb,
  p_cobranca_status text
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_acordo_id uuid;
  v_itens_count integer;
  v_updated_count integer;
  v_status_check text;
  v_cobranca_status_legado text;
begin
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
    where c.id is null
      or c.carteira_id is distinct from p_carteira_id
      or c.condominio_id is distinct from p_condominio_id
      or c.unidade_id is distinct from p_unidade_id
  ) then
    raise exception 'As cobrancas do acordo precisam existir e pertencer a mesma carteira, condominio e unidade.';
  end if;

  select pg_get_constraintdef(oid)
    into v_status_check
  from pg_constraint
  where conrelid = 'public.cobrancas'::regclass
    and contype = 'c'
    and pg_get_constraintdef(oid) ilike '%status%'
    and pg_get_constraintdef(oid) ilike '%acordo%'
  order by conname = 'cobrancas_status_check' desc, conname
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

  return v_acordo_id;
end;
$$;

grant execute on function public.criar_acordo_financeiro(
  uuid,
  uuid,
  uuid,
  uuid,
  text,
  text,
  numeric,
  numeric,
  numeric,
  numeric,
  date,
  text,
  text,
  boolean,
  text,
  text,
  jsonb,
  jsonb,
  text
) to authenticated;
