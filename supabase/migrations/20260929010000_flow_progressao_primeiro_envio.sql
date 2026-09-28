begin;

-- Cada envio confirmado pode liberar somente sua próxima etapa. A fila persiste
-- o lote, inclusive após timeout, e nunca reutiliza o texto de uma etapa anterior.
create table public.flow_progressao (
 id uuid primary key default gen_random_uuid(),
 mensagem_origem_id uuid not null references public.mensagens(id),
 flow_origem_id uuid not null references public.cobranca_flows(id),
 carteira_id uuid not null references public.carteiras(id),
 condominio_id uuid not null references public.condominios(id),
 regua_id uuid not null references public.reguas(id),
 etapa_id uuid not null references public.regua_etapas(id),
 cobranca_ids uuid[] not null,
 primeiro_envio_em timestamptz not null,
 prevista_em timestamptz not null,
 status text not null default 'pendente' check(status in ('pendente','processando','concluido','cancelado','atencao')),
 lote_id uuid references public.lotes(id), flow_id uuid references public.cobranca_flows(id),
 token uuid, lease_ate timestamptz, tentativas integer not null default 0,
 erro text, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(mensagem_origem_id,etapa_id)
);
alter table public.flow_progressao enable row level security;
revoke all on public.flow_progressao from anon,authenticated;
grant all on public.flow_progressao to service_role;
create index flow_progressao_fila on public.flow_progressao(status,prevista_em);

create function public.flow_progressao_ids(m public.mensagens) returns uuid[]
language sql stable set search_path=public as $$
 select array_agg(distinct id) from (
 select m.cobranca_id id where m.cobranca_id is not null
 union select i.cobranca_id from lote_itens i where i.mensagem_id=m.id and i.cobranca_id is not null
 union select value::uuid from jsonb_array_elements_text(coalesce(m.payload->'cobranca_ids','[]'::jsonb))
 ) s;
$$;

create function public.flow_progressao_enfileirar() returns integer
language plpgsql security definer set search_path=public as $$
declare total integer;
begin
 perform pg_advisory_xact_lock(9292026,1);
 with vinculos as materialized (
   select mensagem_id,array_agg(distinct cobranca_id) ids from lote_itens
   where mensagem_id is not null and cobranca_id is not null group by mensagem_id
 ), historico as materialized (
  select h.id,h.status,h.regua_etapa_id,hf.regua_id,coalesce(h.sent_at,h.enviada_em) enviada_em,
   array(select distinct x from unnest(array[h.cobranca_id] || coalesce(v.ids,'{}'::uuid[]) ||
     array(select value::uuid from jsonb_array_elements_text(coalesce(h.payload->'cobranca_ids','[]'::jsonb)))) x where x is not null order by x) ids,he.delay_dias,he.ordem
  from mensagens h join cobranca_flows hf on hf.id=h.cobranca_flow_id
   join regua_etapas he on he.id=h.regua_etapa_id left join vinculos v on v.mensagem_id=h.id where h.status<>'cancelada'
 ), candidatos as materialized (
 select m.id mensagem_id,f.id flow_id,f.carteira_id,c.condominio_id,f.regua_id,e.id etapa_id,hm.ids,a.inicio,
 a.inicio+make_interval(days=>e.delay_dias) prevista_em
 from historico hm join mensagens m on m.id=hm.id join cobranca_flows f on f.id=m.cobranca_flow_id
 join cobrancas c on c.id=m.cobranca_id
 join reguas r on r.id=f.regua_id and r.ativo and r.status is distinct from 'inativa'
 join regua_etapas atual on atual.id=m.regua_etapa_id
 cross join lateral (select n.* from regua_etapas n where n.regua_id=f.regua_id and n.ativo
   and (n.delay_dias,n.ordem,n.id)>(atual.delay_dias,atual.ordem,atual.id)
   order by n.delay_dias,n.ordem,n.id limit 1) e
 cross join lateral (select coalesce(nullif(m.payload->>'primeiro_envio_em','')::timestamptz,
   (select min(h.enviada_em) from historico h
    where h.status='enviada' and h.regua_id=f.regua_id and h.ids && hm.ids),
   coalesce(m.sent_at,m.enviada_em)) inicio) a
 where m.status='enviada' and coalesce(m.sent_at,m.enviada_em) is not null
 and f.status not in ('pausado','cancelado')
 -- Não retroceder o histórico nem duplicar uma etapa já preparada/enviada.
 and not exists(select 1 from historico h
   where h.regua_id=f.regua_id and h.id<>m.id and h.ids && hm.ids
   and (h.delay_dias,h.ordem,h.regua_etapa_id)>=(e.delay_dias,e.ordem,e.id))
 and not exists(select 1 from flow_progressao p where p.regua_id=f.regua_id and p.etapa_id=e.id
   and p.cobranca_ids && hm.ids)
 )
 insert into flow_progressao(mensagem_origem_id,flow_origem_id,carteira_id,condominio_id,regua_id,etapa_id,cobranca_ids,primeiro_envio_em,prevista_em)
 select a.mensagem_id,a.flow_id,a.carteira_id,a.condominio_id,a.regua_id,a.etapa_id,a.ids,a.inicio,a.prevista_em
 from candidatos a join mensagens m on m.id=a.mensagem_id where flow_cobranca_mensagem_elegivel(m)
 on conflict do nothing;
 get diagnostics total=row_count;
 return total;
end $$;

create function public.flow_progressao_claim() returns setof public.flow_progressao
language plpgsql security definer set search_path=public as $$
declare j flow_progressao; l uuid;
begin
 perform pg_advisory_xact_lock(9292026,1);
 perform flow_progressao_enfileirar();
 update flow_progressao p set status='cancelado',erro='Flow de origem cancelado.',token=null,lease_ate=null,updated_at=now()
 from cobranca_flows f where f.id=p.flow_origem_id and f.status='cancelado' and p.status in ('pendente','processando');
 update flow_progressao set status='atencao',erro='Execução interrompida repetidamente.',updated_at=now()
 where status='processando' and lease_ate<now() and tentativas>=5;
 select p.* into j from flow_progressao p join cobranca_flows f on f.id=p.flow_origem_id
 where p.prevista_em<=now() and (p.status='pendente' or (p.status='processando' and p.lease_ate<now()))
 and f.status not in ('pausado','cancelado')
 order by p.prevista_em,p.id limit 1 for update of p skip locked;
 if j.id is null then return; end if;
 if j.lote_id is null then
   insert into lotes(carteira_id,regua_id,tipo,status,iniciado_em,observacoes)
   values(j.carteira_id,j.regua_id,'regua_cobranca','processando',now(),'Continuação automática a partir do primeiro envio confirmado.') returning id into l;
 else l:=j.lote_id; end if;
 return query update flow_progressao set status='processando',lote_id=l,token=gen_random_uuid(),lease_ate=now()+interval '4 minutes',
 tentativas=tentativas+1,updated_at=now() where id=j.id returning *;
end $$;

create function public.flow_progressao_finalizar(p_job uuid,p_token uuid,p_remetente text) returns uuid
language plpgsql security definer set search_path=public as $$
declare j flow_progressao; f uuid; total integer; origem cobranca_flows; m mensagens; nome_etapa text;
begin
 perform pg_advisory_xact_lock(9162026,50);
 select * into strict j from flow_progressao where id=p_job for update;
 if j.token is distinct from p_token or j.status<>'processando' or j.lease_ate<now() then raise exception 'Reserva da continuação expirada.'; end if;
 select * into strict origem from cobranca_flows where id=j.flow_origem_id for update;
 if origem.status in ('pausado','cancelado') then raise exception 'Flow de origem pausado ou cancelado.'; end if;
 if not exists(select 1 from reguas r join regua_etapas e on e.regua_id=r.id where r.id=j.regua_id and r.ativo and r.status is distinct from 'inativa' and e.id=j.etapa_id and e.ativo)
 then raise exception 'Régua ou etapa desativada.'; end if;
 if not exists(select 1 from condominios where id=j.condominio_id and carteira_id=j.carteira_id and status='ativo') then raise exception 'Condomínio inativo ou carteira alterada.'; end if;
 -- Bloqueia qualquer mudança durante a montagem, inclusive em cobrança consolidada.
 perform 1 from cobrancas where id=any(j.cobranca_ids) for update;
 if exists(select 1 from cobrancas c where c.id=any(j.cobranca_ids) and
   (c.carteira_id<>j.carteira_id or c.condominio_id<>j.condominio_id
    or exists(select 1 from acordos a where a.cobranca_id=c.id and a.status in ('ativo','em_dia','em_atraso')))) then raise exception 'Cobrança alterada ou com acordo vigente.'; end if;
 select * into strict m from mensagens where id=j.mensagem_origem_id;
 if exists(select 1 from mensagens h join cobranca_flows hf on hf.id=h.cobranca_flow_id
   join regua_etapas he on he.id=h.regua_etapa_id join regua_etapas e on e.id=j.etapa_id
   where hf.regua_id=j.regua_id and h.status<>'cancelada' and h.lote_id is distinct from j.lote_id
   and flow_progressao_ids(h) && j.cobranca_ids
   and (he.delay_dias,he.ordem,he.id)>=(e.delay_dias,e.ordem,e.id))
 then raise exception 'Etapa já preparada ou enviada em outro Flow.'; end if;
 if not flow_cobranca_mensagem_elegivel(m) then
   update mensagens set status='cancelada',status_operacional='cancelada' where lote_id=j.lote_id;
   update flow_progressao set status='cancelado',erro='Cobrança não elegível.',token=null,lease_ate=null,updated_at=now() where id=j.id;
   return null;
 end if;
 if exists(select 1 from lote_itens where lote_id=j.lote_id and status='erro') then raise exception 'Falha na preparação da próxima etapa.'; end if;
 select count(*) into total from mensagens where lote_id=j.lote_id;
 if total=0 then
   update flow_progressao set status='atencao',erro='Nenhuma mensagem criada. Revise as pendências do lote.',token=null,lease_ate=null,updated_at=now() where id=j.id;
   return null;
 end if;
 if total>20 or exists(select 1 from mensagens where lote_id=j.lote_id and (status<>'pendente_aprovacao' or regua_etapa_id is distinct from j.etapa_id or cobranca_flow_id is not null)) then raise exception 'Mensagens incompatíveis com a continuação.'; end if;
 select 'D+'||delay_dias into nome_etapa from regua_etapas where id=j.etapa_id;
 insert into cobranca_flows(carteira_id,lote_id,regua_id,nome,status,total_mensagens,total_pendentes,payload)
 values(j.carteira_id,j.lote_id,j.regua_id,'Continuação '||nome_etapa||' · '||origem.nome,'pronto',total,total,
 jsonb_build_object('contexto','flow_cobranca','origem','progressao','progressao_id',j.id,'flow_origem_id',origem.id,
 'primeiro_envio_em',j.primeiro_envio_em,'condominio_id',j.condominio_id,'cobranca_ids',j.cobranca_ids)) returning id into f;
 update mensagens set cobranca_flow_id=f,scheduled_at=null,agendada_para=null where lote_id=j.lote_id;
 update lote_itens set cobranca_flow_id=f where lote_id=j.lote_id;
 for m in select * from mensagens where lote_id=j.lote_id loop
   if not flow_cobranca_mensagem_elegivel(m) then raise exception 'Cobrança bloqueada durante a montagem.'; end if;
 end loop;
 perform email_ativar_flow(f,p_remetente,origem.criado_por);
 update flow_progressao set status='concluido',flow_id=f,token=null,lease_ate=null,erro=null,updated_at=now() where id=j.id;
 return f;
end $$;

revoke all on function public.flow_progressao_ids(public.mensagens),public.flow_progressao_enfileirar(),public.flow_progressao_claim(),public.flow_progressao_finalizar(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.flow_progressao_ids(public.mensagens),public.flow_progressao_enfileirar(),public.flow_progressao_claim(),public.flow_progressao_finalizar(uuid,uuid,text) to service_role;

create function public.flow_progressao_tick() returns bigint
language plpgsql security definer set search_path=public as $$
declare t text; r bigint;
begin
 select decrypted_secret into t from vault.decrypted_secrets where name='gkli_email_agenda_token';
 if t is null then raise exception 'Credencial da automação indisponível.'; end if;
 select net.http_get(url:='https://gkli-cob.vercel.app/api/jobs/flows/progredir',headers:=jsonb_build_object('Authorization','Bearer '||t),timeout_milliseconds:=180000) into r;
 return r;
end $$;
revoke all on function public.flow_progressao_tick() from public,anon,authenticated;
grant execute on function public.flow_progressao_tick() to service_role;
select cron.schedule('gkli-flow-progressao','*/2 * * * *','select public.flow_progressao_tick();');
-- Habilitar após o deploy da rota e a verificação da fila histórica.
select cron.alter_job(jobid,active:=false) from cron.job where jobname='gkli-flow-progressao';
commit;
