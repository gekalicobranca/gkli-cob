create or replace function public.get_fechamento_resumo(p_periodo_id uuid)
returns table (
  acordos bigint,
  pagamentos bigint,
  valor_pago numeric,
  valor_recuperado numeric,
  valor_base_cobranca numeric,
  despesas numeric,
  comissoes numeric,
  faturamento numeric,
  divergencias bigint
)
language sql
stable
set search_path = public
as $$
  with pagamento_resumo as (
    select
      count(*)::bigint as acordos,
      count(*)::bigint as pagamentos,
      coalesce(sum(valor_pago), 0)::numeric as valor_pago,
      coalesce(sum(valor_recuperado), 0)::numeric as valor_recuperado,
      coalesce(sum(valor_base_cobranca), 0)::numeric as valor_base_cobranca,
      count(*) filter (where coalesce(divergencia, false))::bigint as divergencias
    from public.fechamento_pagamentos
    where periodo_id = p_periodo_id
  ),
  despesa_resumo as (
    select coalesce(sum(valor_despesa), 0)::numeric as despesas
    from public.fechamento_despesas
    where periodo_id = p_periodo_id
  ),
  comissao_resumo as (
    select coalesce(sum(valor_comissao), 0)::numeric as comissoes
    from public.fechamento_comissoes
    where periodo_id = p_periodo_id
  ),
  faturamento_resumo as (
    select coalesce(sum(valor_faturamento), 0)::numeric as faturamento
    from public.fechamento_faturamentos_omie
    where periodo_id = p_periodo_id
  )
  select
    p.acordos,
    p.pagamentos,
    p.valor_pago,
    p.valor_recuperado,
    p.valor_base_cobranca,
    d.despesas,
    c.comissoes,
    f.faturamento,
    p.divergencias
  from pagamento_resumo p
  cross join despesa_resumo d
  cross join comissao_resumo c
  cross join faturamento_resumo f;
$$;

grant execute on function public.get_fechamento_resumo(uuid) to authenticated;
