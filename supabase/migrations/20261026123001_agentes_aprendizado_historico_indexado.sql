begin;
-- Busca primeiro a unidade e suas cobranças; evita repetir a procura de cotas
-- para cada acordo do condomínio. Inclui vínculos legados, sem filtrar status.
create or replace function public.agentes_aprendizado_acordos(c public.central_pendencias) returns jsonb
language sql stable security invoker set search_path='' as $$
 with unidades_caso as materialized (
  select u.id from public.unidades u where u.condominio_id=c.condominio_id and u.carteira_id=c.carteira_id
   and (u.id=c.unidade_id or coalesce(c.payload->'unidade_ids','[]'::jsonb) ? u.id::text)
 ), cobrancas_caso as materialized (
  select b.id from public.cobrancas b join unidades_caso u on u.id=b.unidade_id where b.condominio_id=c.condominio_id
 ), ids as (
  select a.id from public.acordos a join unidades_caso u on u.id=a.unidade_id where a.condominio_id=c.condominio_id
  union
  select a.id from public.acordos a join cobrancas_caso b on b.id=a.cobranca_id where a.condominio_id=c.condominio_id
  union
  select ac.acordo_id from public.acordo_cobrancas ac join cobrancas_caso b on b.id=ac.cobranca_id
 )
 select coalesce(jsonb_agg(jsonb_build_object('id',a.id,'unidade_id',a.unidade_id,
  'status',a.status,'status_financeiro',a.status_financeiro,'fluxo_status',a.fluxo_status) order by a.id),'[]'::jsonb)
 from public.acordos a join ids on ids.id=a.id where a.condominio_id=c.condominio_id;
$$;
commit;

