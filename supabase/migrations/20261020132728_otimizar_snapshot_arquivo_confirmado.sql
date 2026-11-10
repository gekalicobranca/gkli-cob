-- Usa igualdade para UUIDs e extrai UUIDs dos JSONs antes de comparar.
-- Evita uma expressão regular com centenas de alternativas sobre todas as linhas.
create or replace function public.cobrancas_arquivo_snapshot(p_refs uuid[])
returns jsonb language plpgsql security invoker set search_path=pg_catalog,public as $$
declare r record; dados jsonb; resultado jsonb := '{}'::jsonb; filtro text;
begin
 if coalesce(cardinality(p_refs),0)=0 then raise exception 'Referências ausentes'; end if;
 for r in select c.oid,c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and c.relkind='r' and c.relname<>'cobrancas_duplicidade_execucoes'
  and exists(select 1 from pg_attribute a where a.attrelid=c.oid and a.attnum>0 and not a.attisdropped
    and a.atttypid in ('uuid'::regtype,'jsonb'::regtype,'json'::regtype,'uuid[]'::regtype))
  order by c.relname
 loop
  select string_agg(case
   when a.atttypid='uuid'::regtype then format('t.%I=any($1)',a.attname)
   when a.atttypid='uuid[]'::regtype then format('t.%I && $1',a.attname)
   else format('exists(select 1 from regexp_matches(t.%I::text,''[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'',''gi'') m where m[1]=any($1::text[]))',a.attname)
   end,' or ' order by a.attnum) into filtro
  from pg_attribute a where a.attrelid=r.oid and a.attnum>0 and not a.attisdropped
    and a.atttypid in ('uuid'::regtype,'jsonb'::regtype,'json'::regtype,'uuid[]'::regtype);
  execute format('select coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),''[]''::jsonb) from public.%I t where %s',r.relname,filtro) into dados using p_refs;
  if jsonb_array_length(dados)>0 then resultado:=resultado||jsonb_build_object(r.relname,dados); end if;
 end loop;
 return resultado;
end $$;
revoke all on function public.cobrancas_arquivo_snapshot(uuid[]) from public,anon,authenticated,service_role;
