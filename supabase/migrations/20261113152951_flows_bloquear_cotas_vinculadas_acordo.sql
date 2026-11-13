-- Um acordo vigente protege somente as cotas da sua composição.
-- O vínculo direto também é aceito para acordos cadastrados antes da composição.
create or replace function public.flow_cobrancas_tem_acordo_vigente(p_ids uuid[])
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select exists (
    select 1
    from public.acordos a
    where a.cobranca_id = any(p_ids)
      and a.status in ('ativo', 'em_dia', 'em_atraso')
  ) or exists (
    select 1
    from public.acordo_cobrancas ac
    join public.acordos a on a.id = ac.acordo_id
    where ac.cobranca_id = any(p_ids)
      and a.status in ('ativo', 'em_dia', 'em_atraso')
  );
$$;
