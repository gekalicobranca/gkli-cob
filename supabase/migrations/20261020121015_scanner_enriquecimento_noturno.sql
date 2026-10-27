-- Fila independente da captação: um único lote global, cursor e evidências persistidos.
create table public.scanner_configuracoes (
 id uuid primary key default gen_random_uuid(),
 condominio_id uuid not null unique references public.condominios(id),
 codigo_portal text not null check (codigo_portal ~ '^[0-9]{1,10}$'),
 perfil_acesso text not null check (perfil_acesso ~ '^[A-Z][A-Z0-9_]{0,50}$'),
 unidades text[] not null check (cardinality(unidades) between 1 and 1000),
 ativo boolean not null default false,
 cursor integer not null default 0 check (cursor >= 0),
 proxima_execucao timestamptz not null default now(),
 falhas integer not null default 0,
 ultimo_resultado text,
 atualizado_em timestamptz not null default now()
);
create table public.scanner_controle (
 id boolean primary key default true check(id), token uuid,
 configuracao_id uuid references public.scanner_configuracoes(id),
 reservado_ate timestamptz, proxima_execucao timestamptz not null default now()
);
insert into public.scanner_controle(id) values(true);
create table public.scanner_evidencias (
 id uuid primary key default gen_random_uuid(),
 configuracao_id uuid not null references public.scanner_configuracoes(id),
 unidade_portal text not null, tipo text not null check(tipo in ('contatos','pagamentos')),
 dados jsonb not null, sha256 text not null check(sha256 ~ '^[0-9a-f]{64}$'),
 coletado_em timestamptz not null default now(),
 unique(configuracao_id,unidade_portal,tipo,sha256)
);
create index scanner_evidencias_config_data on public.scanner_evidencias(configuracao_id,coletado_em desc);
alter table public.scanner_configuracoes enable row level security;
alter table public.scanner_controle enable row level security;
alter table public.scanner_evidencias enable row level security;
revoke all on public.scanner_configuracoes,public.scanner_controle,public.scanner_evidencias from anon,authenticated;
grant select,insert,update on public.scanner_configuracoes to authenticated;
grant select on public.scanner_evidencias to authenticated;
grant all on public.scanner_configuracoes,public.scanner_controle,public.scanner_evidencias to service_role;
create policy scanner_config_admin on public.scanner_configuracoes for all to authenticated
 using ((select public.current_user_is_admin())) with check ((select public.current_user_is_admin()));
create policy scanner_evidencias_admin on public.scanner_evidencias for select to authenticated
 using ((select public.current_user_is_admin()));

create function public.scanner_reivindicar(p_token uuid) returns setof public.scanner_configuracoes
language plpgsql security invoker set search_path=public as $$
declare v public.scanner_configuracoes; c public.scanner_controle; horario time;
begin
 if p_token is null then raise exception 'Token obrigatório'; end if;
 horario := (now() at time zone 'America/Sao_Paulo')::time;
 if horario < time '00:30' or horario >= time '05:25' then return; end if;
 select * into c from public.scanner_controle where id for update;
 if c.proxima_execucao > now() or c.reservado_ate > now() then return; end if;
 -- Um executor interrompido impõe pausa antes de qualquer nova tentativa.
 if c.token is not null then
   update public.scanner_controle set token=null,reservado_ate=null,proxima_execucao=now()+interval '30 minutes' where id;
   return;
 end if;
 select s.* into v from public.scanner_configuracoes s join public.condominios d on d.id=s.condominio_id
 where s.ativo and s.proxima_execucao<=now() and d.status='ativo' and lower(d.administradora)='lello'
 order by s.proxima_execucao,s.id limit 1 for update of s skip locked;
 if not found then return; end if;
 update public.scanner_controle set token=p_token,configuracao_id=v.id,reservado_ate=now()+interval '5 minutes' where id;
 return next v;
end $$;

create function public.scanner_concluir(p_token uuid,p_cursor integer,p_evidencias jsonb,p_erro boolean)
returns void language plpgsql security invoker set search_path=public as $$
declare c public.scanner_controle; s public.scanner_configuracoes; e jsonb;
begin
 if p_token is null then raise exception 'Token obrigatório'; end if;
 select * into c from public.scanner_controle where id for update;
 if c.token is distinct from p_token or c.reservado_ate <= now() then raise exception 'Reserva do scanner expirada'; end if;
 select * into s from public.scanner_configuracoes where id=c.configuracao_id for update;
 if p_cursor is null or p_evidencias is null or p_cursor < s.cursor or p_cursor > least(s.cursor+10,cardinality(s.unidades))
 or jsonb_typeof(p_evidencias)<>'array' or jsonb_array_length(p_evidencias)>20 then raise exception 'Lote inválido'; end if;
 for e in select value from jsonb_array_elements(p_evidencias) loop
   if not (e->>'unidade_portal'=any(s.unidades[s.cursor+1:p_cursor])) then raise exception 'Unidade fora do lote'; end if;
   insert into public.scanner_evidencias(configuracao_id,unidade_portal,tipo,dados,sha256)
   values(s.id,e->>'unidade_portal',e->>'tipo',e->'dados',e->>'sha256') on conflict do nothing;
 end loop;
 if (select count(distinct (value->>'unidade_portal',value->>'tipo')) from jsonb_array_elements(p_evidencias)) <> (p_cursor-s.cursor)*2 then
   raise exception 'Unidades incompletas: exigidas evidências de contatos e pagamentos';
 end if;
 update public.scanner_configuracoes set
 cursor=case when p_cursor=cardinality(unidades) then 0 else p_cursor end,
 falhas=case when p_erro then falhas+1 else 0 end,
 ativo=ativo and not(p_erro and falhas>=2),
 proxima_execucao=now()+case when p_erro then interval '30 minutes' * power(2,least(falhas,3))
 when p_cursor=cardinality(unidades) then interval '24 hours' else interval '15 minutes' end,
 ultimo_resultado=case when p_erro then 'Falha no portal; lote interrompido. Após três falhas, reativar após revisão.'
 when p_cursor=s.cursor then 'Lote adiado sem coleta; verificar pausa ou outro coletor em execução.'
 else 'Evidências coletadas; disponíveis para conferência.' end
 where id=s.id;
 update public.scanner_controle set token=null,reservado_ate=null,configuracao_id=null,
 proxima_execucao=now()+case when p_erro then interval '30 minutes' else interval '15 minutes' end where id;
end $$;
revoke all on function public.scanner_reivindicar(uuid),public.scanner_concluir(uuid,integer,jsonb,boolean) from public,anon,authenticated;
grant execute on function public.scanner_reivindicar(uuid),public.scanner_concluir(uuid,integer,jsonb,boolean) to service_role;
