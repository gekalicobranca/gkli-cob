begin;
create table public.workers_controles(
 chave text primary key,habilitado boolean not null default false,atualizado_em timestamptz not null default now()
);
alter table public.workers_controles enable row level security;
revoke all on public.workers_controles from public,anon,authenticated;
grant all on public.workers_controles to service_role;
insert into public.workers_controles(chave,habilitado) values('whatsapp',false);
create function public.workers_whatsapp_permitido() returns boolean
language sql stable security definer set search_path='' as $$
 select coalesce((select habilitado from public.workers_controles where chave='whatsapp'),false);
$$;
create function public.workers_supervisor_fila(p_agendar boolean default false)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_maestro jsonb;v_pdfs jsonb;v_cloud jsonb:='[]';
begin
 v_maestro:=public.maestro_supervisor_fila(p_agendar);
 select coalesce(jsonb_agg(to_jsonb(q)),'[]') into v_pdfs from (
  select distinct on (e.administradora) e.id,
   'pdf:'||case e.administradora when 'Manager' then 'manager' when 'Lello' then 'lello' when 'BBZ' then 'bbz' when 'ATIPASS' then 'atipass' when 'HFlex' then 'hflex' end script_key,
   e.created_at
  from public.agente_acordos_execucoes e
  join public.agente_acordos_configuracoes c on c.condominio_id=e.condominio_id
  join public.condominios condo on condo.id=e.condominio_id
  where e.status='pendente' and c.habilitado and condo.status='ativo'
   and e.administradora in ('Manager','Lello','BBZ','ATIPASS','HFlex')
   and not exists(select 1 from public.agente_acordos_execucoes busy where busy.administradora=e.administradora and busy.status='em_execucao')
  order by e.administradora,e.created_at,e.id
 ) q;
 if public.workers_whatsapp_permitido() and (clock_timestamp() at time zone 'America/Sao_Paulo')::time>=time '09:00'
  and (clock_timestamp() at time zone 'America/Sao_Paulo')::time<time '18:00' then
  select coalesce(jsonb_agg(to_jsonb(q)),'[]') into v_cloud from (
   select m.id,'whatsapp:cloud'::text script_key,m.created_at from public.mensagens m join public.carteiras c on c.id=m.carteira_id
   where m.canal='whatsapp' and m.status='agendada' and m.agendada_para<=clock_timestamp()
    and (m.proxima_tentativa_em is null or m.proxima_tentativa_em<=clock_timestamp())
    and c.whatsapp_transporte='cloud' and c.whatsapp_habilitado is distinct from false
    and (m.provider is null or m.provider<>'whatsapp_web')
   order by m.agendada_para,m.id limit 1
  ) q;
 end if;
 return jsonb_build_object('pendentes',(v_maestro->'pendentes')||v_pdfs||v_cloud,'captacao_ativa',v_maestro->'captacao_ativa','agendadas',v_maestro->'agendadas');
end $$;
-- Pausa operacional persistida, além da tarefa local já desabilitada.
update public.whatsapp_worker_controles set habilitado=false,reiniciar_id=gen_random_uuid(),atualizado_em=now();
do $$declare src text;begin
 src:=replace(pg_get_functiondef('public.whatsapp_web_reservar(text,text)'::regprocedure),E'\r\n',E'\n');
 if position(E'begin\n' in src)=0 then raise exception 'Âncora do claim WhatsApp ausente.';end if;
 execute replace(src,E'begin\n',E'begin\n if not public.workers_whatsapp_permitido() then return null; end if;\n');
end $$;
revoke all on function public.workers_whatsapp_permitido(),public.workers_supervisor_fila(boolean) from public,anon,authenticated;
grant execute on function public.workers_whatsapp_permitido(),public.workers_supervisor_fila(boolean) to service_role;
notify pgrst,'reload schema';
commit;
