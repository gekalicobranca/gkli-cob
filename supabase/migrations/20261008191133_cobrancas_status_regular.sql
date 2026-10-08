begin;
do $$ declare item record; begin
for item in select conname,pg_get_constraintdef(oid) definition from pg_constraint where conrelid='public.cobrancas'::regclass and conname in('cobrancas_status_check','cobrancas_status_operacional_check') loop
execute format('alter table public.cobrancas drop constraint %I',item.conname);
execute format('alter table public.cobrancas add constraint %I %s',item.conname,replace(item.definition,'''novo''::text','''regular''::text, ''novo''::text'));
end loop; end $$;

create function public.classificar_cobranca_regular() returns trigger language plpgsql security invoker set search_path='' as $$
declare dias integer; hoje date:=(now() at time zone 'America/Sao_Paulo')::date;
begin
if new.duplicada_de_id is not null or new.vencimento is null or coalesce(new.status_financeiro,'em_aberto') not in('em_aberto','parcial','vencido') then return new; end if;
select greatest(0,coalesce(dias_apos_vencimento_regua,inicio_cobranca_dias,30)) into dias from public.condominios where id=new.condominio_id;
dias:=coalesce(dias,30);
if new.status_operacional='em_cobranca_ativa' and hoje-new.vencimento<dias then
raise exception 'Cobrança Regular: ainda aos cuidados da administradora; não pode entrar nos flows antes da régua.';
end if;
if new.status_operacional='novo' and new.origem_importacao is not null and hoje-new.vencimento<dias then new.status_operacional:='regular'; new.status:='regular'; end if;
if new.status_operacional='regular' and hoje-new.vencimento>=dias then new.status_operacional:='novo'; new.status:='novo'; end if;
return new;
end $$;
revoke all on function public.classificar_cobranca_regular() from public,anon,authenticated;
create trigger zz_classificar_cobranca_regular before insert or update of status,status_operacional,vencimento,condominio_id on public.cobrancas for each row execute function public.classificar_cobranca_regular();

create function public.liberar_cobrancas_regulares(p_carteiras uuid[] default null,p_condominio uuid default null) returns integer language plpgsql security invoker set search_path='' as $$
declare total integer;
begin
update public.cobrancas c set status='novo',status_operacional='novo' from public.condominios d
where c.condominio_id=d.id and c.status_operacional='regular' and c.duplicada_de_id is null
and c.status_financeiro in('em_aberto','parcial','vencido')
and (p_carteiras is null or c.carteira_id=any(p_carteiras)) and (p_condominio is null or c.condominio_id=p_condominio)
and (now() at time zone 'America/Sao_Paulo')::date-c.vencimento>=greatest(0,coalesce(d.dias_apos_vencimento_regua,d.inicio_cobranca_dias,30))
and not exists(select 1 from public.acordos a where a.cobranca_id=c.id)
and not exists(select 1 from public.acordo_cobrancas a where a.cobranca_id=c.id);
get diagnostics total=row_count;return total;
end $$;
revoke all on function public.liberar_cobrancas_regulares(uuid[],uuid) from public,anon,authenticated;
grant execute on function public.liberar_cobrancas_regulares(uuid[],uuid) to service_role;

create function public.bloquear_regular_nos_flows() returns trigger language plpgsql security invoker set search_path='' as $$
begin
if new.cobranca_flow_id is not null and exists(select 1 from public.cobrancas c where c.id=new.cobranca_id and c.status_operacional='regular') then raise exception 'Cobrança Regular não pode entrar nos flows; continua disponível para acordos.'; end if;
return new;
end $$;
revoke all on function public.bloquear_regular_nos_flows() from public,anon,authenticated;
create trigger bloquear_regular_nos_flows before insert or update of cobranca_id,cobranca_flow_id on public.lote_itens for each row execute function public.bloquear_regular_nos_flows();

-- As propostas dos agentes virtuais permitem Regular, sem aplicar atraso mínimo a esse status.
do $$ declare f record; definition text; begin
for f in select oid from pg_proc where pronamespace='public'::regnamespace and proname in('keila_negociar_acordo','agente_virtual_negociar_acordo') loop
select pg_get_functiondef(f.oid) into definition;
definition:=replace(definition,'''novo'',''em_cobranca_ativa'',''em_negociacao'',''possivel_acordo''','''regular'',''novo'',''em_cobranca_ativa'',''em_negociacao'',''possivel_acordo''');
definition:=replace(definition,'or c.vencimento is null or hoje-c.vencimento<dias','or c.vencimento is null or (coalesce(c.status_operacional,c.status)<>''regular'' and hoje-c.vencimento<dias)');
execute definition;
end loop; end $$;

-- Reclassifica apenas importadas Novo sem acordo e sem itens nos flows.
with alteradas as (
update public.cobrancas c set status='regular',status_operacional='regular' from public.condominios d
where c.condominio_id=d.id and c.origem_importacao is not null and c.status_operacional='novo' and c.duplicada_de_id is null
and c.status_financeiro in('em_aberto','parcial','vencido')
and (now() at time zone 'America/Sao_Paulo')::date-c.vencimento<greatest(0,coalesce(d.dias_apos_vencimento_regua,d.inicio_cobranca_dias,30))
and not exists(select 1 from public.acordos a where a.cobranca_id=c.id)
and not exists(select 1 from public.acordo_cobrancas a where a.cobranca_id=c.id)
and not exists(select 1 from public.lote_itens i where i.cobranca_id=c.id and i.cobranca_flow_id is not null)
returning c.*)
insert into public.auditoria_eventos(carteira_id,entidade_tipo,entidade_id,evento_tipo,titulo,descricao,antes,depois)
select carteira_id,'cobranca',id,'cobranca.classificada_regular','Cobrança Regular','Importada antes do início da régua; aos cuidados da administradora e disponível para acordos.',jsonb_build_object('status','novo','status_operacional','novo'),to_jsonb(a) from alteradas a;
notify pgrst,'reload schema';
commit;
