insert into public.pre_juridico_casos (
  carteira_id,
  acordo_id,
  condominio_id,
  unidade_id,
  cobranca_id,
  etapa,
  created_at,
  updated_at
)
select
  a.carteira_id,
  a.id,
  a.condominio_id,
  a.unidade_id,
  a.cobranca_id,
  'aguardando_administradora',
  coalesce(a.updated_at, a.created_at, now()),
  coalesce(a.updated_at, a.created_at, now())
from public.acordos a
left join public.cobrancas c on c.id = a.cobranca_id
where a.carteira_id is not null
  and (
    a.fluxo_status = 'rompido_pre_juridico'
    or coalesce(c.status_operacional, c.status) = 'pre_juridico'
    or exists (
      select 1
      from public.acordo_cobrancas ac
      join public.cobrancas vinculada on vinculada.id = ac.cobranca_id
      where ac.acordo_id = a.id
        and coalesce(vinculada.status_operacional, vinculada.status) = 'pre_juridico'
    )
  )
on conflict (acordo_id) do nothing;
