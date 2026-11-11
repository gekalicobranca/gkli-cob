-- Conferência de cobranças EXISTENTES. Regulares incluídas por orientação expressa.
-- Nenhum RPC deste módulo escreve em cobranças, acordos, parcelas ou mensagens.
alter table public.scanner_controle add column saldos_ativo boolean not null default true;
alter table public.scanner_controle add column ultimo_saldo_em timestamptz;

create function public.scanner_saldos_alvos() returns table(
 unidade_id uuid,condominio_id uuid,carteira_id uuid,identificacao text,bloco text,
 condominio text,receita_id uuid,portal text,configuracao jsonb,cobrancas jsonb,saldo_centavos bigint
) language sql stable security invoker set search_path=public as $$
 with base as (
 select u.id unidade_id,u.condominio_id,u.carteira_id,u.identificacao,u.bloco,c.nome condominio,
 jsonb_agg(jsonb_build_object('id',b.id,'vencimento',b.vencimento,'original_centavos',round(coalesce(b.valor_original,0)*100)::bigint,
 'atual_centavos',round(coalesce(b.valor_atualizado,b.valor_original,0)*100)::bigint,
 'status',coalesce(b.status_operacional,b.status),'recibo',public.cobranca_recibo_arquivo(b.observacoes)) order by b.id) cobrancas,
 round(sum(coalesce(b.valor_atualizado,b.valor_original,0))*100)::bigint saldo_centavos
 from public.unidades u join public.condominios c on c.id=u.condominio_id and c.carteira_id=u.carteira_id
 join public.cobrancas b on b.unidade_id=u.id and b.condominio_id=u.condominio_id and b.carteira_id=u.carteira_id
 where c.status='ativo' and not coalesce(u.acao_judicial,false) and nullif(trim(u.numero_processo),'') is null
 and b.duplicada_de_id is null and b.status_financeiro='em_aberto' and b.data_pagamento is null
 and coalesce(b.status_operacional,b.status) in ('novo','em_cobranca_ativa','regular')
 and not exists(select 1 from public.pre_juridico_casos p where p.unidade_id=u.id)
 and not exists(select 1 from public.cobrancas x where x.unidade_id=u.id and x.duplicada_de_id is null
  and x.status_financeiro='em_aberto' and x.data_pagamento is null
  and (x.status in ('pre_juridico','pre_distribuicao','judicializado') or x.status_operacional in ('pre_juridico','pre_distribuicao','judicializado')))
 and not exists(select 1 from public.acordos a where a.unidade_id=u.id and a.tipo='judicial' and a.status not in ('cancelado','quitado','renegociado'))
 and not exists(select 1 from public.central_pendencias p where p.unidade_id=u.id and p.tipo='conciliacao_pesquisa_judicial' and p.status not in ('resolvida','cancelada'))
 group by u.id,c.nome having sum(coalesce(b.valor_atualizado,b.valor_original,0))>10000
 )
 select b.unidade_id,b.condominio_id,b.carteira_id,b.identificacao,b.bloco,b.condominio,r.id,
 case r.script_key when 'captacao_lello' then 'lello' when 'manager_atentum_cotas_pendentes' then 'manager'
 when 'bbz_condopro_clock_vila_romana' then 'bbz' when 'captacao_hflex' then 'hflex' when 'verti_winker_inadimplencia' then 'winker' end,
 jsonb_build_object('codigo_portal',coalesce(r.config_json->>'codigo_portal',r.config_json->>'codigo_cliente'),
 'perfil_acesso',coalesce(s.perfil_acesso,'PADRAO')),b.cobrancas,b.saldo_centavos
 from base b left join lateral(select a.id,a.script_key,a.config_json from public.agente_receitas a
 where a.ativo and a.config_json->>'condominio_id'=b.condominio_id::text
 and a.script_key in ('captacao_lello','manager_atentum_cotas_pendentes','bbz_condopro_clock_vila_romana','captacao_hflex','verti_winker_inadimplencia')
 and coalesce(a.config_json->>'coleta_segmentada','false')<>'true'
 order by a.id limit 1)r on true
 left join public.scanner_configuracoes s on s.condominio_id=b.condominio_id;
$$;

create table public.scanner_saldos_fila(
 unidade_id uuid primary key references public.unidades(id),condominio_id uuid not null references public.condominios(id),
 proxima_execucao timestamptz not null default now(),reservado_token uuid,ultimo_resultado text,conferido_em timestamptz
);
create index scanner_saldos_fila_ordem on public.scanner_saldos_fila(proxima_execucao,condominio_id);
create index scanner_saldos_fila_reserva on public.scanner_saldos_fila(reservado_token);
create index scanner_saldos_fila_condominio on public.scanner_saldos_fila(condominio_id);
create table public.scanner_saldos_lotes(
 token uuid primary key,condominio_id uuid not null references public.condominios(id),receita_id uuid references public.agente_receitas(id),
 portal text,alvos jsonb not null check(jsonb_array_length(alvos) between 1 and 20),
 iniciado_em timestamptz not null default now(),concluido_em timestamptz
);
create index scanner_saldos_lotes_condominio on public.scanner_saldos_lotes(condominio_id);
create index scanner_saldos_lotes_receita on public.scanner_saldos_lotes(receita_id);
create table public.scanner_saldos_conferencias(
 id uuid primary key default gen_random_uuid(),token uuid not null references public.scanner_saldos_lotes(token),
 unidade_id uuid not null references public.unidades(id),condominio_id uuid not null references public.condominios(id),carteira_id uuid not null,
 observado_em timestamptz not null default now(),resultado text not null,
 confirmado_por text not null default 'scanner_noturno' check(confirmado_por='scanner_noturno'),
 cobrancas_app jsonb not null,itens jsonb not null,fonte text,sha256 text,
 motivo text,extras_ignorados integer not null default 0 check(extras_ignorados>=0),
 unique(token,unidade_id),check(resultado in ('confirmada_em_aberto','parcial','nao_confirmada','elegibilidade_alterada'))
);
create index scanner_saldos_conferencias_unidade on public.scanner_saldos_conferencias(unidade_id,observado_em desc);
create index scanner_saldos_conferencias_condominio on public.scanner_saldos_conferencias(condominio_id,observado_em desc);
create index scanner_saldos_conferencias_carteira on public.scanner_saldos_conferencias(carteira_id);

alter table public.scanner_saldos_fila enable row level security;
alter table public.scanner_saldos_lotes enable row level security;
alter table public.scanner_saldos_conferencias enable row level security;
revoke all on public.scanner_saldos_fila,public.scanner_saldos_lotes,public.scanner_saldos_conferencias from public,anon,authenticated,service_role;
grant select,insert,update on public.scanner_saldos_fila,public.scanner_saldos_lotes to service_role;
grant select,insert on public.scanner_saldos_conferencias to service_role;
grant select on public.scanner_saldos_fila,public.scanner_saldos_lotes,public.scanner_saldos_conferencias to authenticated;
create policy scanner_saldos_fila_admin on public.scanner_saldos_fila for select to authenticated using((select public.current_user_is_admin()));
create policy scanner_saldos_lotes_admin on public.scanner_saldos_lotes for select to authenticated using((select public.current_user_is_admin()));
create policy scanner_saldos_conferencias_admin on public.scanner_saldos_conferencias for select to authenticated using((select public.current_user_is_admin()));

create function public.scanner_saldos_reivindicar(p_token uuid) returns jsonb language plpgsql security invoker set search_path=public as $$
declare c public.scanner_controle;d uuid;alvos jsonb;primeiro jsonb;horario time;
begin
 if p_token is null then raise exception 'Token obrigatório';end if;
 horario:=(now() at time zone 'America/Sao_Paulo')::time;
 if horario<time '00:30' or horario>=time '05:25' then return null;end if;
 select * into c from public.scanner_controle where id for update;
 if not c.saldos_ativo or c.proxima_execucao>now() or c.reservado_ate>now() then return null;end if;
 -- O enriquecimento antigo também pode recuperar o controle global expirado.
 -- Libera reservas órfãs da conferência mesmo quando aquele executor já limpou o token.
 update public.scanner_saldos_fila f set reservado_token=null,proxima_execucao=greatest(f.proxima_execucao,now()+interval '30 minutes')
 where f.reservado_token is not null and f.reservado_token is distinct from c.token
 and exists(select 1 from public.scanner_saldos_lotes l where l.token=f.reservado_token and l.iniciado_em<=now()-interval '5 minutes');
 update public.scanner_saldos_lotes set concluido_em=now() where concluido_em is null and token is distinct from c.token and iniciado_em<=now()-interval '5 minutes';
 if c.token is not null then
  update public.scanner_saldos_fila set reservado_token=null,proxima_execucao=now()+interval '30 minutes' where reservado_token=c.token;
  update public.scanner_saldos_lotes set concluido_em=now() where token=c.token and concluido_em is null;
  update public.scanner_controle set token=null,configuracao_id=null,reservado_ate=null,proxima_execucao=now()+interval '30 minutes' where id;
  return null;
 end if;
 -- Alterna com o enriquecimento existente, compartilhando reserva e pausa global.
 if c.ultimo_saldo_em>coalesce((select max(ultima_tentativa_em) from public.scanner_configuracoes),'-infinity'::timestamptz)
 and exists(select 1 from public.scanner_configuracoes s join public.condominios d on d.id=s.condominio_id
 where s.ativo and d.status='ativo' and s.situacao in ('validado','aguardando_primeira_coleta') and s.proxima_execucao<=now()) then return null;end if;
 insert into public.scanner_saldos_fila(unidade_id,condominio_id) select unidade_id,condominio_id from public.scanner_saldos_alvos()
 on conflict(unidade_id) do update set condominio_id=excluded.condominio_id;
 select f.condominio_id into d from public.scanner_saldos_fila f join public.scanner_saldos_alvos() a using(unidade_id)
 where f.proxima_execucao<=now() and f.reservado_token is null order by f.conferido_em nulls first,f.proxima_execucao,f.unidade_id limit 1;
 if not found then return null;end if;
 select jsonb_agg(to_jsonb(x) order by x.unidade_id) into alvos from (
 select a.* from public.scanner_saldos_fila f join public.scanner_saldos_alvos() a using(unidade_id)
 where f.condominio_id=d and f.proxima_execucao<=now() and f.reservado_token is null order by f.conferido_em nulls first,f.proxima_execucao,f.unidade_id limit 20
 )x;
 primeiro:=alvos->0;
 insert into public.scanner_saldos_lotes(token,condominio_id,receita_id,portal,alvos)
 values(p_token,d,(primeiro->>'receita_id')::uuid,primeiro->>'portal',alvos);
 update public.scanner_saldos_fila set reservado_token=p_token where unidade_id in(select (value->>'unidade_id')::uuid from jsonb_array_elements(alvos));
 update public.scanner_controle set token=p_token,configuracao_id=null,reservado_ate=now()+interval '5 minutes' where id;
 return jsonb_build_object('token',p_token,'condominio_id',d,'receita_id',primeiro->>'receita_id','portal',primeiro->>'portal','alvos',alvos);
end $$;

create function public.scanner_saldos_registrar(p_token uuid,p_unidade uuid,p_resultado jsonb) returns jsonb language plpgsql security invoker set search_path=public as $$
declare c public.scanner_controle;snapshot jsonb;atual jsonb;itens jsonb;resultado text;n integer;id_salvo uuid;
begin
 select id into id_salvo from public.scanner_saldos_conferencias where token=p_token and unidade_id=p_unidade;
 if found then return jsonb_build_object('id',id_salvo,'reutilizado',true);end if;
 select * into c from public.scanner_controle where id for update;
 if c.token is distinct from p_token or c.reservado_ate<=now() then raise exception 'Reserva expirada';end if;
 select value into snapshot from public.scanner_saldos_lotes l,jsonb_array_elements(l.alvos) where l.token=p_token and l.concluido_em is null and value->>'unidade_id'=p_unidade::text;
 if not found then raise exception 'Unidade fora do lote';end if;
 perform 1 from public.unidades where id=p_unidade for update;
 perform 1 from public.cobrancas where unidade_id=p_unidade for share;
 itens:=p_resultado->'itens';
 if jsonb_typeof(itens) is distinct from 'array' or jsonb_array_length(itens)<>jsonb_array_length(snapshot->'cobrancas')
 or exists(select 1 from jsonb_array_elements(itens) i where not exists(select 1 from jsonb_array_elements(snapshot->'cobrancas') b where b->>'id'=i->>'id') or coalesce(i->>'situacao','') not in ('confirmada_em_aberto','nao_confirmada'))
 or (select count(distinct value->>'id') from jsonb_array_elements(itens))<>jsonb_array_length(itens) then raise exception 'Itens fora do escopo';end if;
 select to_jsonb(a) into atual from public.scanner_saldos_alvos()a where a.unidade_id=p_unidade;
 if atual is null or atual->'cobrancas' is distinct from snapshot->'cobrancas' or atual->>'carteira_id' is distinct from snapshot->>'carteira_id' then
  resultado:='elegibilidade_alterada';
  select jsonb_agg(value||jsonb_build_object('situacao','nao_confirmada','motivo','Elegibilidade alterada após a reserva')) into itens from jsonb_array_elements(itens);
 else
  select count(*) into n from jsonb_array_elements(itens) i where i->>'situacao'='confirmada_em_aberto';
  resultado:=case when n=jsonb_array_length(itens) then 'confirmada_em_aberto' when n>0 then 'parcial' else 'nao_confirmada' end;
 end if;
 if exists(select 1 from jsonb_array_elements(itens) i where i->>'situacao'='confirmada_em_aberto')
 and (coalesce(p_resultado->>'sha256','')!~'^[0-9a-f]{64}$' or nullif(p_resultado->>'fonte','') is null) then raise exception 'Confirmação sem evidência';end if;
 if exists(select 1 from jsonb_array_elements(itens)i where i->>'situacao'='confirmada_em_aberto'
 and (coalesce(i->>'recibo_portal','')!~'^[0-9]+$' or coalesce(i->>'principal_portal_centavos','')!~'^[0-9]+$' or coalesce(i->>'saldo_portal_centavos','')!~'^[0-9]+$')) then raise exception 'Confirmação sem valores e recibo';end if;
 insert into public.scanner_saldos_conferencias(token,unidade_id,condominio_id,carteira_id,resultado,cobrancas_app,itens,fonte,sha256,motivo,extras_ignorados)
 values(p_token,p_unidade,(snapshot->>'condominio_id')::uuid,(snapshot->>'carteira_id')::uuid,resultado,snapshot->'cobrancas',itens,
 left(p_resultado->>'fonte',1000),p_resultado->>'sha256',left(p_resultado->>'motivo',500),greatest(0,coalesce((p_resultado->>'extras_ignorados')::integer,0))) returning id into id_salvo;
 update public.scanner_saldos_fila set reservado_token=null,conferido_em=now(),ultimo_resultado=resultado,proxima_execucao=now()+case when resultado='elegibilidade_alterada' then interval '30 minutes' else interval '24 hours' end where unidade_id=p_unidade;
 return jsonb_build_object('id',id_salvo,'resultado',resultado);
end $$;

create function public.scanner_saldos_concluir(p_token uuid) returns void language plpgsql security invoker set search_path=public as $$
begin
 perform 1 from public.scanner_controle where id and token=p_token for update;
 if not found then return;end if;
 update public.scanner_saldos_fila set reservado_token=null,proxima_execucao=now()+interval '30 minutes' where reservado_token=p_token;
 update public.scanner_saldos_lotes set concluido_em=now() where token=p_token and concluido_em is null;
 update public.scanner_controle set token=null,configuracao_id=null,reservado_ate=null,ultimo_saldo_em=now(),proxima_execucao=now()+interval '15 minutes' where id;
end $$;
revoke all on function public.scanner_saldos_alvos(),public.scanner_saldos_reivindicar(uuid),public.scanner_saldos_registrar(uuid,uuid,jsonb),public.scanner_saldos_concluir(uuid) from public,anon,authenticated;
grant execute on function public.scanner_saldos_alvos(),public.scanner_saldos_reivindicar(uuid),public.scanner_saldos_registrar(uuid,uuid,jsonb),public.scanner_saldos_concluir(uuid) to service_role;
