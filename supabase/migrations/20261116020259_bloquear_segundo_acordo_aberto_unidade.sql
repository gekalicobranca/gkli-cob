do $migration$
declare
  assinatura regprocedure := 'public.criar_acordo_financeiro(uuid,uuid,uuid,uuid,text,text,numeric,numeric,numeric,numeric,date,text,text,boolean,text,text,jsonb,jsonb,text)'::regprocedure;
  definicao text := pg_get_functiondef(assinatura);
  marcador text := '  -- BLOQUEIO_COBRANCA_EM_OUTRO_ACORDO';
  guarda text := $guard$
  -- BLOQUEIO_SEGUNDO_ACORDO_ABERTO_UNIDADE
  -- Criações com cotas diferentes ainda precisam disputar o mesmo lock de unidade.
  perform 1
  from public.unidades u
  where u.id = p_unidade_id or u.id in (
    select c.unidade_id from public.cobrancas c
    join jsonb_to_recordset(p_itens) i(cobranca_id uuid) on i.cobranca_id = c.id
  )
  order by u.id
  for no key update;

  with unidades_selecionadas as (
    select p_unidade_id as id
    union
    select c.unidade_id from public.cobrancas c
    join jsonb_to_recordset(p_itens) i(cobranca_id uuid) on i.cobranca_id = c.id
  )
  select a.id, a.status into v_conflito
  from public.acordos a
  where a.carteira_id = p_carteira_id and a.condominio_id = p_condominio_id
    and a.status in ('ativo', 'em_dia', 'em_atraso', 'vencido', 'suspenso')
    and coalesce(a.status_financeiro, '') <> 'quitado'
    and position('[DUPLICIDADE_ACORDO_CONCILIADA]' in coalesce(a.observacoes, '')) = 0
    and (
      a.unidade_id in (select id from unidades_selecionadas)
      or exists (
        select 1 from public.cobrancas origem
        where origem.unidade_id in (select id from unidades_selecionadas)
          and (origem.id = a.cobranca_id or exists (
            select 1 from public.acordo_cobrancas ac
            where ac.acordo_id = a.id and ac.cobranca_id = origem.id
          ))
      )
    )
  order by a.id
  limit 1;
  if found then
    raise exception 'Uma das unidades selecionadas já tem acordo em aberto (%). Consulte /app/acordos/% antes de criar outro.',
      v_conflito.status, v_conflito.id using errcode = '23505';
  end if;

$guard$;
begin
  if strpos(definicao, marcador) = 0 then
    raise exception 'Ponto de validação dos acordos não encontrado.';
  end if;
  execute replace(definicao, marcador, guarda || marcador);
end;
$migration$;
