begin;
create table public.maestro_flow_controle (
 carteira_id uuid primary key references carteiras(id),
 ativo boolean not null default false,
 updated_at timestamptz not null default now()
);
create table public.maestro_flow_ativacoes (
 flow_id uuid primary key references cobranca_flows(id),
 carteira_id uuid not null references carteiras(id),
 status text not null default 'pendente' check(status in ('pendente','ativado','atencao','manual')),
 erro text,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
alter table maestro_flow_controle enable row level security;
alter table maestro_flow_ativacoes enable row level security;
revoke all on maestro_flow_controle,maestro_flow_ativacoes from anon,authenticated;
grant all on maestro_flow_controle,maestro_flow_ativacoes to service_role;
insert into maestro_flow_controle(carteira_id) select id from carteiras;
create function public.maestro_flow_enfileirar_ativacao() returns trigger
language plpgsql security definer set search_path=public as $$
begin
 if new.payload->>'origem'='maestro' and new.status='pronto' and new.total_mensagens>0
 and exists(select 1 from maestro_flow_controle where carteira_id=new.carteira_id and ativo) then
   insert into maestro_flow_ativacoes(flow_id,carteira_id) values(new.id,new.carteira_id) on conflict do nothing;
 end if;
 return new;
end $$;
create trigger maestro_flow_ativacao_novo after insert on cobranca_flows
for each row execute function maestro_flow_enfileirar_ativacao();

create function public.maestro_flow_ativar(p_flow uuid,p_remetente text) returns text
language plpgsql security definer set search_path=public as $$
declare q maestro_flow_ativacoes; f cobranca_flows; n int;
begin
 perform pg_advisory_xact_lock(9162026,50);
 select * into q from maestro_flow_ativacoes where flow_id=p_flow for update;
 if not found or q.status<>'pendente' then return 'ignorado'; end if;
 perform 1 from maestro_flow_controle where carteira_id=q.carteira_id for share;
 if exists(select 1 from automacao_controle where chave='captacao_global' and not ativo)
 or not exists(select 1 from maestro_flow_controle where carteira_id=q.carteira_id and ativo) then return 'pausado'; end if;
 select * into strict f from cobranca_flows where id=p_flow for update;
 if f.status<>'pronto' then
   update maestro_flow_ativacoes set status='manual',updated_at=now() where flow_id=p_flow;
   return 'manual';
 end if;
 begin
   if f.payload->>'origem' is distinct from 'maestro' or f.carteira_id<>q.carteira_id then raise exception 'Origem ou carteira do flow alterada.'; end if;
   if not exists(select 1 from condominios where id=(f.payload->>'condominio_id')::uuid and carteira_id=f.carteira_id and status='ativo') then raise exception 'CondomÃƒÂ­nio inativo ou carteira alterada.'; end if;
   if exists(select 1 from lote_itens i join cobrancas c on c.id=i.cobranca_id
     where i.cobranca_flow_id=f.id and i.status in ('criado','aprovado') and
     (c.automacao_bloqueada or c.status_operacional not in ('novo','em_cobranca_ativa')
     or c.status_financeiro in ('quitado','renegociado','cancelado')
     or c.status in ('possivel_acordo','acordo_firmado','acordo_efetivado','pre_juridico','judicializado','suspenso')
     or c.carteira_id<>f.carteira_id or c.condominio_id<>(f.payload->>'condominio_id')::uuid
     or exists(select 1 from acordos a where a.cobranca_id=c.id and a.status in ('ativo','em_dia','em_atraso'))
     or exists(select 1 from acordo_cobrancas ac join acordos a on a.id=ac.acordo_id where ac.cobranca_id=c.id and a.status in ('ativo','em_dia','em_atraso'))))
     then raise exception 'CobranÃƒÂ§a bloqueada, com acordo ou alterada; conferir antes de ativar.'; end if;
   if exists(select 1 from mensagens where cobranca_flow_id=f.id and canal<>'email') then raise exception 'Canal fora da montagem automÃƒÂ¡tica de e-mail; ativaÃƒÂ§ÃƒÂ£o manual necessÃƒÂ¡ria.'; end if;
   if exists(select 1 from mensagens where cobranca_flow_id=f.id and
     (status<>'pendente_aprovacao' or coalesce(nullif(email_destinatario,''),destinatario,'') !~ '^[^[:space:]@;,]+@[^[:space:]@;,]+[.][^[:space:]@;,]+$')) then
     raise exception 'Mensagem alterada ou destinatário inválido; conferir antes de ativar.';
   end if;
   n := email_ativar_flow(f.id,p_remetente,null);
   update maestro_flow_ativacoes set status='ativado',erro=null,updated_at=now() where flow_id=f.id;
   return 'ativado';
 exception when others then
   update maestro_flow_ativacoes set status='atencao',erro=sqlerrm,updated_at=now() where flow_id=f.id;
   return 'atencao';
 end;
end $$;
revoke all on function maestro_flow_enfileirar_ativacao(),maestro_flow_ativar(uuid,text) from public,anon,authenticated;
grant execute on function maestro_flow_ativar(uuid,text) to service_role;

create or replace function public.maestro_flow_tick() returns bigint
language plpgsql security definer set search_path=public as $$
declare t text; r bigint;
begin
 if not exists(select 1 from maestro_flow_montagens where status='pendente' or (status='processando' and lease_ate<now()))
 and not exists(select 1 from maestro_flow_ativacoes a join maestro_flow_controle c using(carteira_id) where a.status='pendente' and c.ativo) then return null; end if;
 select decrypted_secret into t from vault.decrypted_secrets where name='gkli_email_agenda_token';
 if t is null then raise exception 'Credencial da automaÃƒÂ§ÃƒÂ£o indisponÃƒÂ­vel.'; end if;
 select net.http_get(url:='https://gkli-cob.vercel.app/api/jobs/flows/montar',headers:=jsonb_build_object('Authorization','Bearer '||t),timeout_milliseconds:=180000) into r;
 return r;
end $$;
commit;
