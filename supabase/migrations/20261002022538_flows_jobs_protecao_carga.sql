begin;

-- Persistent leases span separate PostgREST transactions and Vercel instances.
create table public.flows_jobs_controle (
 chave text primary key check(chave in ('flows','montar','progredir')),
 token uuid, lease_ate timestamptz, requisicao_ate timestamptz, requisicao_id bigint, ultimo_job text,
 proxima_execucao timestamptz not null default '-infinity',
 falhas integer not null default 0 check(falhas between 0 and 10)
);
alter table public.flows_jobs_controle enable row level security;
revoke all on public.flows_jobs_controle from public,anon,authenticated;
grant all on public.flows_jobs_controle to service_role;
insert into public.flows_jobs_controle(chave) values('flows'),('montar'),('progredir');

create function public.flows_job_reservar(p_job text) returns uuid
language plpgsql security invoker set search_path=public as $$
declare t uuid; f integer;
begin
 if p_job not in ('montar','progredir') then raise exception 'Job inválido.'; end if;
 if not pg_try_advisory_xact_lock(10012026,1) then return null; end if;
 if exists(select 1 from flows_jobs_controle where chave in ('flows',p_job)
   and (proxima_execucao>now() or lease_ate>now())) then return null; end if;
 t:=gen_random_uuid();
 select least(falhas+1,10) into f from flows_jobs_controle where chave=p_job;
 -- Pessimistic failure state survives a killed worker; success clears it.
 update flows_jobs_controle set token=t,lease_ate=now()+interval '4 minutes',
   requisicao_ate=null,requisicao_id=null,proxima_execucao=now()+interval '4 minutes'+
   make_interval(secs=>least(1800,120*power(2,f-1)::integer))
 where chave in ('flows',p_job);
 update flows_jobs_controle set falhas=f where chave=p_job;
 update flows_jobs_controle set ultimo_job=p_job where chave='flows';
 return t;
end $$;

create function public.flows_job_concluir(p_job text,p_token uuid,p_sucesso boolean) returns boolean
language plpgsql security invoker set search_path=public as $$
declare f integer;
begin
 if p_job not in ('montar','progredir') then raise exception 'Job inválido.'; end if;
 perform pg_advisory_xact_lock(10012026,1);
 if not exists(select 1 from flows_jobs_controle where chave='flows' and token=p_token and lease_ate>=now())
 or not exists(select 1 from flows_jobs_controle where chave=p_job and token=p_token) then return false; end if;
 select falhas into f from flows_jobs_controle where chave=p_job;
 update flows_jobs_controle set token=null,lease_ate=null,requisicao_ate=null,requisicao_id=null,
   proxima_execucao=case when p_sucesso then now() else
     now()+make_interval(secs=>least(1800,120*power(2,f-1)::integer)) end
 where chave in ('flows',p_job);
 if p_sucesso then update flows_jobs_controle set falhas=0 where chave=p_job; end if;
 return true;
end $$;
revoke all on function public.flows_job_reservar(text),public.flows_job_concluir(text,uuid,boolean) from public,anon,authenticated;
grant execute on function public.flows_job_reservar(text),public.flows_job_concluir(text,uuid,boolean) to service_role;

-- Event-driven discovery plus a periodic, resumable scan of legacy messages.
create table public.flow_progressao_fontes (
 mensagem_id uuid primary key references public.mensagens(id) on delete cascade
);
create table public.flow_progressao_backfill (
 chave boolean primary key default true check(chave), cursor_id uuid,
 concluido boolean not null default false,
 revisar_apos timestamptz not null default now()
);
insert into public.flow_progressao_backfill(chave) values(true);
alter table public.flow_progressao_fontes enable row level security;
alter table public.flow_progressao_backfill enable row level security;
revoke all on public.flow_progressao_fontes,public.flow_progressao_backfill from public,anon,authenticated;
grant all on public.flow_progressao_fontes,public.flow_progressao_backfill to service_role;

-- Definer is required for writes from authenticated message/flow operations.
-- Trigger functions are not exposed as RPCs; only their trigger invokes them.
create function public.flow_progressao_marcar_fonte() returns trigger
language plpgsql security definer set search_path=public as $$
begin
 if new.status='enviada' and new.cobranca_flow_id is not null
 and coalesce(new.sent_at,new.enviada_em) is not null then
   insert into flow_progressao_fontes values(new.id) on conflict do nothing;
 end if;
 return new;
end $$;
create trigger flow_progressao_fonte_envio after insert or update of status,sent_at,enviada_em,cobranca_flow_id,regua_etapa_id,payload,cobranca_id
 on public.mensagens for each row execute function public.flow_progressao_marcar_fonte();

create function public.flow_progressao_reavaliar_flow() returns trigger
language plpgsql security definer set search_path=public as $$
begin
 if new.status is distinct from old.status or new.regua_id is distinct from old.regua_id then
   insert into flow_progressao_fontes select id from mensagens
     where cobranca_flow_id=new.id and status='enviada' and coalesce(sent_at,enviada_em) is not null
     on conflict do nothing;
 end if;
 return new;
end $$;
create trigger flow_progressao_fonte_flow after update of status,regua_id on public.cobranca_flows
 for each row execute function public.flow_progressao_reavaliar_flow();

create function public.flow_progressao_reavaliar_regua() returns trigger
language plpgsql security definer set search_path=public as $$
declare r uuid;
begin
 if tg_table_name='reguas' then r:=coalesce(new.id,old.id);
 else r:=coalesce(new.regua_id,old.regua_id); end if;
 insert into flow_progressao_fontes select m.id from mensagens m join cobranca_flows f on f.id=m.cobranca_flow_id
   where f.regua_id=r and m.status='enviada' and coalesce(m.sent_at,m.enviada_em) is not null on conflict do nothing;
 return null;
end $$;
create trigger flow_progressao_fonte_regua after update of ativo,status on public.reguas
 for each row execute function public.flow_progressao_reavaliar_regua();
create trigger flow_progressao_fonte_etapa after insert or update or delete on public.regua_etapas
 for each row execute function public.flow_progressao_reavaliar_regua();
revoke all on function public.flow_progressao_marcar_fonte(),public.flow_progressao_reavaliar_flow(),public.flow_progressao_reavaliar_regua() from public,anon,authenticated;

-- Limit SQL duration as well as HTTP duration (client abort alone is insufficient).
alter function public.maestro_flow_claim() set statement_timeout='10s';

create or replace function public.flow_progressao_enfileirar() returns integer
language plpgsql security definer set search_path=public as $$
declare total integer; fontes uuid[]; historicas uuid[]; ultimo uuid;
begin

 if not pg_try_advisory_xact_lock(9292026,1) then return 0; end if;
 -- Changed messages first; then one bounded page of pre-existing history.
 select array_agg(mensagem_id) into fontes from
   (select mensagem_id from flow_progressao_fontes order by mensagem_id limit 25 for update skip locked) q;
 -- A periodic bounded sweep also catches eligibility changes outside messages.
 update flow_progressao_backfill set cursor_id=null,concluido=false
   where chave=true and concluido and revisar_apos<=now();
 select cursor_id into ultimo from flow_progressao_backfill where chave=true for update;
 if not (select concluido from flow_progressao_backfill where chave=true) then
   select array_agg(id order by id) into historicas from
     (select id from mensagens where ultimo is null or id>ultimo order by id limit 25) q;
   update flow_progressao_backfill set cursor_id=coalesce(historicas[array_length(historicas,1)],cursor_id),
     concluido=coalesce(array_length(historicas,1),0)<25,
     revisar_apos=now()+interval '15 minutes' where chave=true;
 end if;
 fontes:=coalesce(fontes,'{}'::uuid[]) || coalesce(historicas,'{}'::uuid[]);
 if cardinality(fontes)=0 then return 0; end if;
 with sementes as materialized (
   select m.id,f.regua_id,flow_progressao_ids(m) ids
   from mensagens m join cobranca_flows f on f.id=m.cobranca_flow_id
   where m.id=any(fontes) and m.status='enviada' and coalesce(m.sent_at,m.enviada_em) is not null
 ), relevantes as materialized (
   select distinct h.id from sementes s join cobranca_flows f on f.regua_id=s.regua_id
   join mensagens h on h.cobranca_flow_id=f.id
   where h.status<>'cancelada' and (h.cobranca_id=any(s.ids)
     or exists(select 1 from lote_itens i where i.mensagem_id=h.id and i.cobranca_id=any(s.ids))
     or (h.payload->'cobranca_ids') ?| array(select x::text from unnest(s.ids) x))
 ), vinculos as materialized (
   select mensagem_id,array_agg(distinct cobranca_id) ids from lote_itens
   where mensagem_id in (select id from relevantes) and cobranca_id is not null group by mensagem_id
 ), historico as materialized (
  select h.id,h.status,h.regua_etapa_id,hf.regua_id,coalesce(h.sent_at,h.enviada_em) enviada_em,
   array(select distinct x from unnest(array[h.cobranca_id] || coalesce(v.ids,'{}'::uuid[]) ||
     array(select value::uuid from jsonb_array_elements_text(coalesce(h.payload->'cobranca_ids','[]'::jsonb)))) x where x is not null order by x) ids,he.delay_dias,he.ordem
  from mensagens h join cobranca_flows hf on hf.id=h.cobranca_flow_id
   join regua_etapas he on he.id=h.regua_etapa_id left join vinculos v on v.mensagem_id=h.id where h.id in (select id from relevantes)
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
 where m.id=any(fontes) and m.status='enviada' and coalesce(m.sent_at,m.enviada_em) is not null
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
 delete from flow_progressao_fontes where mensagem_id=any(fontes);
 return total;
end $$;


create or replace function public.flow_progressao_claim() returns setof public.flow_progressao
language plpgsql security definer set search_path=public as $$
declare j flow_progressao; l uuid;
begin
 if not pg_try_advisory_xact_lock(9292026,1) then return; end if;
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


-- Keep expensive discovery out of claim. A tick dispatches only actionable work.
alter function public.flow_progressao_enfileirar() set statement_timeout='10s';
alter function public.flow_progressao_claim() set statement_timeout='10s';

create function public.flows_job_tem_trabalho(p_job text) returns boolean
language sql stable security invoker set search_path=public as $$
 select case p_job
 when 'progredir' then exists(select 1 from flow_progressao_fontes)
   or exists(select 1 from flow_progressao_backfill where not concluido or revisar_apos<=now())
   or exists(select 1 from flow_progressao p join cobranca_flows f on f.id=p.flow_origem_id
     where p.prevista_em<=now() and (p.status='pendente' or (p.status='processando' and p.lease_ate<now()))
     and f.status not in ('pausado','cancelado'))
 when 'montar' then not exists(select 1 from automacao_controle where chave='captacao_global' and not ativo)
   and (exists(select 1 from maestro_flow_montagens where status='pendente' or (status='processando' and lease_ate<now()))
     or exists(select 1 from maestro_flow_ativacoes a join maestro_flow_controle c using(carteira_id) where a.status='pendente' and c.ativo))
 else false end
$$;
revoke all on function public.flows_job_tem_trabalho(text) from public,anon,authenticated;
grant execute on function public.flows_job_tem_trabalho(text) to service_role;

-- Also back off when HTTP/DNS/SSL fails before the endpoint acquires its lease.
create function public.flows_job_reconciliar_http() returns void
language plpgsql security definer set search_path=public as $$
declare j flows_jobs_controle; resposta net._http_response; f integer; falhou boolean;
begin
 for j in select * from flows_jobs_controle where chave in ('montar','progredir') and requisicao_id is not null loop
   select * into resposta from net._http_response where id=j.requisicao_id;
   if not found and j.requisicao_ate>now() then continue; end if;
   falhou:=resposta.id is null or coalesce(resposta.timed_out,false) or resposta.error_msg is not null
     or resposta.status_code is null or resposta.status_code not between 200 and 299;
   f:=least(j.falhas+1,10);
   update flows_jobs_controle set requisicao_id=null,requisicao_ate=null,
     proxima_execucao=case when falhou then greatest(proxima_execucao,
       now()+make_interval(secs=>least(1800,120*power(2,f-1)::integer))) else proxima_execucao end
   where chave=j.chave or (chave='flows' and requisicao_id=j.requisicao_id);
   if falhou then update flows_jobs_controle set falhas=f where chave=j.chave; end if;
 end loop;
end $$;
revoke all on function public.flows_job_reconciliar_http() from public,anon,authenticated;

create or replace function public.flow_progressao_tick() returns bigint
language plpgsql security definer set search_path=public as $$
declare t text; r bigint;
begin
 if not pg_try_advisory_xact_lock(10012026,1) then return null; end if;
 perform flows_job_reconciliar_http();
 if exists(select 1 from flows_jobs_controle where chave in ('flows','progredir')
   and (proxima_execucao>now() or lease_ate>now() or requisicao_ate>now())) then return null; end if;
 if not flows_job_tem_trabalho('progredir') then return null; end if;
 -- Alternate when both queues have work, even if cron runs montar first.
 if (select ultimo_job='progredir' from flows_jobs_controle where chave='flows')
 and flows_job_tem_trabalho('montar')
 and exists(select 1 from flows_jobs_controle where chave='montar' and proxima_execucao<=now()
   and coalesce(requisicao_ate,'-infinity')<=now()) then return null; end if;
 select decrypted_secret into t from vault.decrypted_secrets where name='gkli_email_agenda_token';
 if t is null then raise exception 'Credencial da automação indisponível.'; end if;
 select net.http_get(url:='https://gkli-cob.vercel.app/api/jobs/flows/progredir',
   headers:=jsonb_build_object('Authorization','Bearer '||t),timeout_milliseconds:=150000) into r;
 update flows_jobs_controle set requisicao_id=r,requisicao_ate=now()+interval '160 seconds' where chave in ('flows','progredir');
 return r;
end $$;

create or replace function public.maestro_flow_tick() returns bigint
language plpgsql security definer set search_path=public as $$
declare t text; r bigint;
begin
 if not pg_try_advisory_xact_lock(10012026,1) then return null; end if;
 perform flows_job_reconciliar_http();
 if exists(select 1 from flows_jobs_controle where chave in ('flows','montar')
   and (proxima_execucao>now() or lease_ate>now() or requisicao_ate>now())) then return null; end if;
 if not flows_job_tem_trabalho('montar') then return null; end if;
 if (select ultimo_job='montar' from flows_jobs_controle where chave='flows')
 and flows_job_tem_trabalho('progredir')
 and exists(select 1 from flows_jobs_controle where chave='progredir' and proxima_execucao<=now()
   and coalesce(requisicao_ate,'-infinity')<=now()) then return null; end if;
 select decrypted_secret into t from vault.decrypted_secrets where name='gkli_email_agenda_token';
 if t is null then raise exception 'Credencial da automação indisponível.'; end if;
 select net.http_get(url:='https://gkli-cob.vercel.app/api/jobs/flows/montar',
   headers:=jsonb_build_object('Authorization','Bearer '||t),timeout_milliseconds:=150000) into r;
 update flows_jobs_controle set requisicao_id=r,requisicao_ate=now()+interval '160 seconds' where chave in ('flows','montar');
 return r;
end $$;

revoke all on function public.flow_progressao_tick(),public.maestro_flow_tick() from public,anon,authenticated;
grant execute on function public.flow_progressao_tick(),public.maestro_flow_tick() to service_role;
-- Deployment does not authorize resuming the incident's cron jobs.
select cron.alter_job(jobid,active:=false) from cron.job where jobname in ('gkli-maestro-flows','gkli-flow-progressao');
notify pgrst,'reload schema';
commit;
