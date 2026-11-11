begin;

create or replace function public.maestro_flow_enfileirar_ativacao()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.payload->>'origem' in ('maestro', 'easy_maestro')
     and new.status = 'pronto'
     and new.total_mensagens > 0
     and exists (
       select 1 from public.maestro_flow_controle
       where carteira_id = new.carteira_id and ativo
     ) then
    insert into public.maestro_flow_ativacoes(flow_id, carteira_id)
    values (new.id, new.carteira_id)
    on conflict (flow_id) do nothing;
  end if;
  return new;
end;
$$;

do $$
declare
  src text;
  antigo text := 'if f.payload->>''origem'' is distinct from ''maestro''';
  novo text := 'if coalesce(f.payload->>''origem'','''') not in (''maestro'',''easy_maestro'')';
begin
  src := pg_get_functiondef('public.maestro_flow_ativar(uuid,text)'::regprocedure);
  if position(antigo in src) > 0 then
    execute replace(src, antigo, novo);
  elsif position(novo in src) = 0 then
    raise exception 'Guard de origem de maestro_flow_ativar mudou; revise a migração.';
  end if;
end;
$$;

insert into public.maestro_flow_ativacoes(flow_id, carteira_id, status)
select f.id, f.carteira_id, 'pendente'
from public.cobranca_flows f
join public.maestro_flow_controle mc on mc.carteira_id = f.carteira_id and mc.ativo
where f.id = any(array[
  'e57dafd6-1192-46d5-89c7-7179da372949'::uuid,
  '3d0ac085-5571-4df8-871b-ef17839089dc'::uuid,
  'd93461bd-903f-4920-a27e-b79bde8cc89d'::uuid,
  '37d1b5ad-c7bd-455e-b6e2-6a3e5198d931'::uuid,
  'a95d76f5-5d3b-44dd-8ac3-80cd3fdf8e92'::uuid,
  '3dcc0be0-ee4a-457d-b238-24daac836791'::uuid
])
  and f.payload->>'origem' = 'easy_maestro'
  and f.status = 'pronto'
  and f.total_mensagens > 0
  and exists (select 1 from public.automacao_controle where chave='captacao_global' and ativo)
on conflict (flow_id) do nothing;

commit;
