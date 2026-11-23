begin;

create table public.maestro_limpeza_diaria (
  id boolean primary key default true check (id),
  ativa boolean not null default true,
  alterada_por uuid references public.profiles(id),
  alterada_em timestamptz,
  ultimo_corte timestamptz,
  executada_em timestamptz,
  cancelados integer check (cancelados >= 0)
);
insert into public.maestro_limpeza_diaria default values;
alter table public.maestro_limpeza_diaria enable row level security;
revoke all on public.maestro_limpeza_diaria from public, anon, authenticated, service_role;
grant select, update (ativa, alterada_por, alterada_em) on public.maestro_limpeza_diaria to service_role;

-- Executada apenas pelo dono do job. O relógio e a data de corte pertencem ao banco.
create function public.maestro_limpar_fila_diaria() returns void
language plpgsql security invoker set search_path = '' set lock_timeout = '10s' as $$
declare
  corte timestamptz := ((now() at time zone 'America/Sao_Paulo')::date + time '06:00') at time zone 'America/Sao_Paulo';
  config public.maestro_limpeza_diaria;
  quantidade integer;
  motivo constant text := 'Cancelado pela limpeza diária das 06h, antes do início da coleta.';
begin
  select * into strict config from public.maestro_limpeza_diaria where id for update;
  if not config.ativa or now() < corte or config.ultimo_corte >= corte then return; end if;

  with encerrados as (
    update public.agente_execucoes e
    set status = 'cancelada', finalizado_em = now(), erro_mensagem = motivo
    where (e.easy_maestro_lote_id is not null or e.origem in ('maestro','maestro_agendada','agenda_mensal'))
      and e.status = 'pendente' and e.tentativas = 0
      and e.iniciado_em is null and e.finalizado_em is null and e.created_at <= corte
      and (e.agendado_para is null or e.agendado_para <= corte)
      and not exists (select 1 from public.agente_arquivos a where a.execucao_id = e.id)
      and not exists (select 1 from public.maestro_flow_montagens m where m.execucao_id = e.id)
      and not exists (select 1 from public.agente_logs l where l.execucao_id = e.id
        and (l.step = 'importacao_automatica' or l.metadata_json ? 'conversao_id'))
    returning e.id, e.carteira_id
  ), logs as (
    insert into public.agente_logs(execucao_id, nivel, step, mensagem, metadata_json)
    select id, 'info', 'limpeza_diaria', motivo, jsonb_build_object('corte',corte) from encerrados
  ), auditoria as (
    insert into public.auditoria_eventos(carteira_id, entidade_tipo, entidade_id, evento_tipo, titulo, descricao, antes, depois)
    select carteira_id, 'agente_execucao', id, 'maestro_limpeza_diaria', 'Captação cancelada pela rotina diária', motivo,
      jsonb_build_object('status','pendente'), jsonb_build_object('status','cancelada','corte',corte) from encerrados
  )
  select count(*) into quantidade from encerrados;

  update public.maestro_limpeza_diaria set ultimo_corte = corte, executada_em = now(), cancelados = quantidade where id;
end $$;
revoke all on function public.maestro_limpar_fila_diaria() from public, anon, authenticated, service_role;

-- O pg_cron de produção usa GMT. Em Brasília, 09:00 UTC corresponde a 06:00.
select cron.schedule('gkli-maestro-limpeza-diaria','0 9 * * *','select public.maestro_limpar_fila_diaria();');
notify pgrst, 'reload schema';
commit;
