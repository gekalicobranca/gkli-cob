create or replace function public.propagar_acordo_quebrado_cobrancas()
returns trigger language plpgsql set search_path = '' as $$
begin
  if coalesce(new.observacoes,'') like '%[DUPLICIDADE_ACORDO_CONCILIADA]%' then return new; end if;
  with vinculadas as materialized (
    select new.cobranca_id as id where new.cobranca_id is not null
    union
    select ac.cobranca_id from public.acordo_cobrancas ac where ac.acordo_id = new.id
  ), elegiveis as materialized (
    select id from vinculadas where not public.cobranca_tem_acordo_preservado(id)
  )
  update public.cobrancas c
  set status = 'acordo_quebrado', status_operacional = 'acordo_quebrado'
  from elegiveis e
  where c.id = e.id and c.duplicada_de_id is null
    and (c.status is distinct from 'acordo_quebrado' or c.status_operacional is distinct from 'acordo_quebrado');
  return new;
end $$;
