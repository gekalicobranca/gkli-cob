begin;
create table public.maestro_flow_montagens (
 id uuid primary key default gen_random_uuid(),
 execucao_id uuid not null references public.agente_execucoes(id),
 conversao_id uuid not null unique references public.conversoes_relatorio(id),
 carteira_id uuid not null references public.carteiras(id),
 condominio_id uuid not null references public.condominios(id),
 regua_id uuid references public.reguas(id),
 status text not null default 'pendente' check(status in ('pendente','processando','concluido','atencao')),
 plano jsonb, parte integer not null default 0,
 lote_id uuid references public.lotes(id),
 flow_ids uuid[] not null default '{}', pendencias jsonb not null default '[]',
 erro text, token uuid, lease_ate timestamptz, tentativas integer not null default 0,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
alter table public.maestro_flow_montagens enable row level security;
revoke all on public.maestro_flow_montagens from anon,authenticated;
grant all on public.maestro_flow_montagens to service_role;

create function public.maestro_flow_claim() returns setof public.maestro_flow_montagens
language plpgsql security definer set search_path=public as $$
declare j public.maestro_flow_montagens;
begin
 perform pg_advisory_xact_lock(9172026,1);
 update maestro_flow_montagens set status='atencao',erro='Execução interrompida repetidamente. Use Retomar montagem.',updated_at=now()
 where status='processando' and lease_ate<now() and tentativas>=5;
 select * into j from maestro_flow_montagens a
 where (a.status='pendente' or (a.status='processando' and a.lease_ate<now()))
 and not exists(select 1 from maestro_flow_montagens b where b.condominio_id=a.condominio_id and b.id<>a.id and b.status='processando' and b.lease_ate>=now())
 order by a.updated_at,a.id limit 1 for update skip locked;
 if j.id is null then return; end if;
 return query update maestro_flow_montagens set status='processando',token=gen_random_uuid(),lease_ate=now()+interval '4 minutes',
 tentativas=tentativas+1,updated_at=now() where id=j.id returning *;
end $$;

create function public.maestro_flow_lote(p_job uuid,p_token uuid) returns uuid
language plpgsql security definer set search_path=public as $$
declare j public.maestro_flow_montagens; l uuid;
begin
 select * into strict j from maestro_flow_montagens where id=p_job for update;
 if j.token is distinct from p_token or j.status<>'processando' or j.lease_ate<now() then raise exception 'Reserva da montagem expirada.'; end if;
 if j.lote_id is not null then return j.lote_id; end if;
 insert into lotes(carteira_id,regua_id,tipo,status,iniciado_em,observacoes)
 values(j.carteira_id,j.regua_id,'regua_cobranca','processando',now(),'Montagem automática do Maestro; ativação manual.') returning id into l;
 update maestro_flow_montagens set lote_id=l,updated_at=now() where id=j.id;
 return l;
end $$;

create function public.maestro_flow_finalizar(p_job uuid,p_token uuid,p_nome text) returns uuid
language plpgsql security definer set search_path=public as $$
declare j public.maestro_flow_montagens; f uuid; total integer; falhas integer; ids uuid[];
begin
 select * into strict j from maestro_flow_montagens where id=p_job for update;
 if j.token is distinct from p_token or j.status<>'processando' or j.lease_ate<now() then raise exception 'Reserva da montagem expirada.'; end if;
 if j.lote_id is null then raise exception 'Lote não preparado.'; end if;
 if not exists(select 1 from condominios where id=j.condominio_id and carteira_id=j.carteira_id and status='ativo') then raise exception 'Condomínio inativo ou carteira alterada.'; end if;
 if exists(select 1 from lote_itens i join cobrancas c on c.id=i.cobranca_id where i.lote_id=j.lote_id and i.status='criado' and
   (c.automacao_bloqueada or c.status_operacional not in ('novo','em_cobranca_ativa') or c.status_financeiro in ('quitado','renegociado')
    or c.status in ('possivel_acordo','acordo_firmado','acordo_efetivado','pre_juridico','judicializado','suspenso')
    or c.carteira_id<>j.carteira_id or c.condominio_id<>j.condominio_id
    or exists(select 1 from acordos a where a.cobranca_id=c.id and a.status in ('ativo','em_dia','em_atraso')))) then raise exception 'Cobrança bloqueada ou alterada durante a montagem; revisar antes de prosseguir.'; end if;
 select count(*) into total from mensagens where lote_id=j.lote_id;
 if total>20 then raise exception 'Mais de 20 mensagens: revisar a unidade antes de liberar o Flow.'; end if;
 if exists(select 1 from mensagens where lote_id=j.lote_id and (status<>'pendente_aprovacao' or cobranca_flow_id is not null)) then raise exception 'Mensagens alteradas durante a montagem.'; end if;
 select count(*) into falhas from lote_itens where lote_id=j.lote_id and status='erro';
 select array_agg(value::uuid) into ids from jsonb_array_elements_text(j.plano->j.parte);
 insert into cobranca_flows(carteira_id,lote_id,regua_id,nome,status,total_mensagens,total_pendentes,total_falhas,payload)
 values(j.carteira_id,j.lote_id,j.regua_id,p_nome,case when total>0 then 'pronto' when falhas>0 then 'concluido_com_falhas' else 'concluido' end,total,total,falhas,
 jsonb_build_object('contexto','flow_cobranca','origem','maestro','montagem_id',j.id,'condominio_id',j.condominio_id,'cobranca_ids',ids,'parte',j.parte+1)) returning id into f;
 update mensagens set cobranca_flow_id=f,agendada_para=null,scheduled_at=null where lote_id=j.lote_id;
 update lote_itens set cobranca_flow_id=f where lote_id=j.lote_id;
 update cobrancas set status='em_cobranca_ativa',status_operacional='em_cobranca_ativa'
 where id=any(ids) and status_operacional='novo' and exists(select 1 from lote_itens i where i.lote_id=j.lote_id and i.cobranca_id=cobrancas.id and i.status='criado');
 update maestro_flow_montagens set flow_ids=array_append(flow_ids,f),parte=parte+1,lote_id=null,
 pendencias=pendencias||coalesce((select jsonb_agg(jsonb_build_object('cobranca_id',i.cobranca_id,'motivo',coalesce(i.motivo,i.status),'saneamento',false)) from lote_itens i where i.lote_id=j.lote_id and i.status<>'criado'),'[]'::jsonb),
 status=case when parte+1>=jsonb_array_length(plano) then 'concluido' else 'pendente' end,
 token=null,lease_ate=null,tentativas=0,erro=null,updated_at=now() where id=j.id;
 return f;
end $$;
revoke all on function public.maestro_flow_claim(),public.maestro_flow_lote(uuid,uuid),public.maestro_flow_finalizar(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.maestro_flow_claim(),public.maestro_flow_lote(uuid,uuid),public.maestro_flow_finalizar(uuid,uuid,text) to service_role;

create function public.maestro_flow_tick() returns bigint
language plpgsql security definer set search_path=public as $$
declare t text; r bigint;
begin
 if not exists(select 1 from maestro_flow_montagens where status='pendente' or (status='processando' and lease_ate<now())) then return null; end if;
 select decrypted_secret into t from vault.decrypted_secrets where name='gkli_email_agenda_token';
 if t is null then raise exception 'Credencial da automação indisponível.'; end if;
 select net.http_get(url:='https://gkli-cob.vercel.app/api/jobs/flows/montar',headers:=jsonb_build_object('Authorization','Bearer '||t),timeout_milliseconds:=180000) into r;
 return r;
end $$;
revoke all on function public.maestro_flow_tick() from public,anon,authenticated;
grant execute on function public.maestro_flow_tick() to service_role;
select cron.schedule('gkli-maestro-flows','*/2 * * * *','select public.maestro_flow_tick();');
select cron.alter_job(jobid,active:=false) from cron.job where jobname='gkli-maestro-flows';
commit;
