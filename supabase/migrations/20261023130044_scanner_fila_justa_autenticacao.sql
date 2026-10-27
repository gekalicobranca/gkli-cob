-- Rodízio persistido entre portais. Não altera unidades, cursores ou habilitações.
alter table public.scanner_configuracoes add column ultima_tentativa_em timestamptz;
create index scanner_configuracoes_portal_tentativa on public.scanner_configuracoes(portal,ultima_tentativa_em desc);
-- Histórico existente impede que os lotes antigos voltem a monopolizar a abertura da janela.
update public.scanner_configuracoes s set ultima_tentativa_em=(select max(e.coletado_em) from public.scanner_evidencias e where e.configuracao_id=s.id);

create or replace function public.scanner_reivindicar(p_token uuid) returns setof public.scanner_configuracoes
language plpgsql security invoker set search_path=public as $$
declare v public.scanner_configuracoes; c public.scanner_controle; horario time;
begin
 if p_token is null then raise exception 'Token obrigatório'; end if;
 horario := (now() at time zone 'America/Sao_Paulo')::time;
 if horario < time '00:30' or horario >= time '05:25' then return; end if;
 select * into c from public.scanner_controle where id for update;
 if c.proxima_execucao > now() or c.reservado_ate > now() then return; end if;
 if c.token is not null then
   update public.scanner_controle set token=null,reservado_ate=null,proxima_execucao=now()+interval '30 minutes' where id;
   return;
 end if;
 select s.* into v from public.scanner_configuracoes s join public.condominios d on d.id=s.condominio_id
 where s.ativo and s.situacao in ('validado','aguardando_primeira_coleta') and s.proxima_execucao<=now() and d.status='ativo' and (
   (s.portal='lello' and (lower(d.administradora)='lello' or (
     d.id='13290a44-ec8d-4232-81e7-711196547f91'::uuid and lower(d.administradora)='hubert/lello' and s.codigo_portal='62430'
   ))) or exists (
     select 1 from public.agente_receitas r where r.id=s.receita_id
     and r.config_json->>'condominio_id'=d.id::text and (
       (s.portal='manager' and lower(d.administradora)='manager' and r.script_key='manager_atentum_cotas_pendentes' and r.config_json->>'codigo_cliente'=s.codigo_portal)
       or (s.portal='bbz' and lower(d.administradora)='bbz' and r.script_key='bbz_condopro_clock_vila_romana' and coalesce(r.config_json->>'coleta_segmentada','false')<>'true')
       or (s.portal='graiche' and lower(d.administradora)='graiche' and r.script_key='captacao_graiche')
       or (s.portal='sell' and lower(d.administradora)='sell' and r.script_key='captacao_sell')
     )
   )
 )
 and not exists (
   select 1 from public.scanner_configuracoes p where p.portal=s.portal and p.falhas>0
   and p.ultima_tentativa_em>now()-interval '24 hours' and p.proxima_execucao>now()
 )
 order by coalesce((select max(p.ultima_tentativa_em) from public.scanner_configuracoes p where p.portal=s.portal),'-infinity'::timestamptz),
 case s.portal when 'manager' then 0 when 'bbz' then 1 when 'lello' then 2 else 3 end,
 s.ultima_tentativa_em nulls first,case s.situacao when 'validado' then 0 else 1 end,
 s.proxima_execucao,s.id limit 1 for update of s skip locked;
 if not found then return; end if;
 update public.scanner_controle set token=p_token,configuracao_id=v.id,reservado_ate=now()+interval '5 minutes' where id;
 update public.scanner_configuracoes set ultima_tentativa_em=now() where id=v.id returning * into v;
 return next v;
end $$;
revoke all on function public.scanner_reivindicar(uuid) from public,anon,authenticated;
grant execute on function public.scanner_reivindicar(uuid) to service_role;


-- Pausa global de 15 minutos; falhas mantêm backoff por condomínio e por portal.
create or replace function public.scanner_concluir(p_token uuid,p_cursor integer,p_evidencias jsonb,p_erro boolean)
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
 proxima_execucao=now()+interval '15 minutes' where id;
end $$;

revoke all on function public.scanner_concluir(uuid,integer,jsonb,boolean) from public,anon,authenticated;
grant execute on function public.scanner_concluir(uuid,integer,jsonb,boolean) to service_role;
