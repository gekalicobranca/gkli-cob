begin;

create or replace function public.easy_espelhamento_resumir(p_resultado jsonb)
returns jsonb language sql immutable set search_path='' as $$
  select case when p_resultado is not null then jsonb_build_object(
    'cotas',p_resultado->'cotas',
    'acordos',p_resultado->'acordos',
    'parcelasPagas',p_resultado->'parcelasPagas',
    'pendencias',case when jsonb_typeof(p_resultado->'pendencias')='array' then (
      select count(*) from jsonb_array_elements(p_resultado->'pendencias') item
      where item->>'tipo' is distinct from 'repasse'
    ) else 0 end,
    'erro',p_resultado->'erro') end;
$$;

update public.easy_espelhamentos
set resumo=public.easy_espelhamento_resumir(resultado)
where resultado->'pendencias' @> '[{"tipo":"repasse"}]'::jsonb
  and resumo is distinct from public.easy_espelhamento_resumir(resultado);

commit;
