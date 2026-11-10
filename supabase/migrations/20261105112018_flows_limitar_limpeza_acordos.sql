begin;

-- Resolve as cotas da unidade uma vez, usando os índices de unidade e composição,
-- em vez de repetir buscas correlacionadas para cada acordo vigente.
create or replace function public.flow_cobrancas_tem_acordo_vigente(p_ids uuid[])
returns boolean language sql stable security invoker set search_path = '' as $$
  with alvos as materialized (
    select c.id, c.unidade_id from public.cobrancas c where c.id = any(p_ids)
  ), relacionadas as materialized (
    select c.id from public.cobrancas c where c.unidade_id in (select unidade_id from alvos)
    union select id from alvos
  )
  select exists (
    select 1 from public.acordos a
    where a.status in ('ativo', 'em_dia', 'em_atraso') and (
      a.unidade_id in (select unidade_id from alvos)
      or a.cobranca_id in (select id from relacionadas)
      or a.id in (select ac.acordo_id from public.acordo_cobrancas ac
        where ac.cobranca_id in (select id from relacionadas))
    )
  );
$$;

do $migration$
declare v_src text; v_anchor text;
begin
  v_src := pg_get_functiondef('public.flow_cobranca_cancelar_acordos_vigentes(uuid[])'::regprocedure);
  v_anchor := 'limit case when p_ids is null then 25 else null end';
  if position(v_anchor in v_src) = 0 then raise exception 'Limpeza incompatível'; end if;
  execute replace(v_src, v_anchor, 'limit case when p_ids is null then 5 else null end');
end;
$migration$;

commit;
