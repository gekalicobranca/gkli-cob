-- Novo estado operacional: visível para agrupamento, bloqueado para flows e novos acordos.
do $$
declare coluna text;
begin
  foreach coluna in array array['status','status_operacional'] loop
    execute format('alter table public.cobrancas drop constraint %I', 'cobrancas_' || coluna || '_check');
    execute format($sql$alter table public.cobrancas add constraint %I check (
      %I is null or %I in (
        'regular','novo','em_cobranca_ativa','em_negociacao','possivel_acordo',
        'acordo_firmado','acordo_efetivado','acordo_quebrado','pre_distribuicao',
        'pre_juridico','judicializado','suspenso','aberto','aberta','em cobranca ativa',
        'em negociacao','possivel acordo','acordo firmado','acordo efetivado','pre juridico'
      )) not valid$sql$, 'cobrancas_' || coluna || '_check', coluna, coluna);
  end loop;
end $$;

-- Protege também status legado divergente durante reserva, ativação e envio.
-- CREATE OR REPLACE mantém as permissões das funções existentes.
do $$
declare f record; definicao text;
begin
  for f in select oid from pg_proc where pronamespace = 'public'::regnamespace
    and proname in ('flow_cancelar_apos_status_cobranca','flow_cobranca_mensagem_elegivel','maestro_flow_ativar','maestro_flow_finalizar')
  loop
    select pg_get_functiondef(f.oid) into definicao;
    if strpos(definicao, 'acordo_quebrado') = 0 then
      definicao := replace(definicao,
        $old$'acordo_firmado','acordo_efetivado'$old$,
        $new$'acordo_firmado','acordo_efetivado','acordo_quebrado'$new$);
      if strpos(definicao, 'acordo_quebrado') = 0 then raise exception 'Revisar função de flow antes de migrar: %', f.oid; end if;
      execute definicao;
    end if;
  end loop;
end $$;

-- Um acordo posterior válido prevalece sobre o histórico quebrado da mesma cobrança.
create or replace function public.cobranca_tem_acordo_preservado(cobranca uuid)
returns boolean language sql stable set search_path = '' as $$
  select exists (
    select 1 from public.acordos a
    where a.status in ('ativo','em_dia','em_atraso','vencido','quitado')
      and coalesce(a.observacoes,'') not like '%[DUPLICIDADE_ACORDO_CONCILIADA]%'
      and coalesce(a.observacoes,'') not like '%[EXCLUIR_SOMA_DIVIDA_SUBSTITUICAO_PENDENTE]%'
      and (a.cobranca_id = cobranca or exists (
        select 1 from public.acordo_cobrancas ac where ac.acordo_id = a.id and ac.cobranca_id = cobranca
      ))
  );
$$;
revoke all on function public.cobranca_tem_acordo_preservado(uuid) from public, anon;
grant execute on function public.cobranca_tem_acordo_preservado(uuid) to authenticated, service_role;

create or replace function public.propagar_acordo_quebrado_cobrancas()
returns trigger language plpgsql set search_path = '' as $$
begin
  if coalesce(new.observacoes,'') like '%[DUPLICIDADE_ACORDO_CONCILIADA]%' then return new; end if;
  update public.cobrancas c set status = 'acordo_quebrado', status_operacional = 'acordo_quebrado'
  where c.duplicada_de_id is null
    and (c.id = new.cobranca_id or exists (
      select 1 from public.acordo_cobrancas ac where ac.acordo_id = new.id and ac.cobranca_id = c.id
    ))
    and not public.cobranca_tem_acordo_preservado(c.id)
    and (c.status is distinct from 'acordo_quebrado' or c.status_operacional is distinct from 'acordo_quebrado');
  -- O trigger existente flow_cancelar_apos_status_cobranca cancela os envios pendentes.
  return new;
end $$;
revoke all on function public.propagar_acordo_quebrado_cobrancas() from public, anon;
create trigger propagar_acordo_quebrado_cobrancas
after insert or update of status on public.acordos for each row
when (new.status = 'quebrado') execute function public.propagar_acordo_quebrado_cobrancas();

create or replace function public.bloquear_selecao_cobranca_acordo_quebrado()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and new.cobranca_id is not distinct from old.cobranca_id then return new; end if;
  if exists (select 1 from public.cobrancas c where c.id = new.cobranca_id
    and (c.status_operacional = 'acordo_quebrado' or c.status = 'acordo_quebrado')) then
    raise exception 'Acordos quebrado: cobrança bloqueada para seleção em novo acordo.';
  end if;
  return new;
end $$;
revoke all on function public.bloquear_selecao_cobranca_acordo_quebrado() from public, anon;
create trigger bloquear_selecao_acordo_quebrado_direto
before insert or update of cobranca_id on public.acordos for each row
execute function public.bloquear_selecao_cobranca_acordo_quebrado();
create trigger bloquear_selecao_acordo_quebrado_composicao
before insert or update of cobranca_id on public.acordo_cobrancas for each row
execute function public.bloquear_selecao_cobranca_acordo_quebrado();

-- Migra somente registros canônicos; cópias arquivadas e acordos posteriores são preservados.
with alvos as materialized (
  select c.* from public.cobrancas c
  where c.duplicada_de_id is null and not public.cobranca_tem_acordo_preservado(c.id)
    and exists (select 1 from public.acordos a where a.status = 'quebrado'
      and coalesce(a.observacoes,'') not like '%[DUPLICIDADE_ACORDO_CONCILIADA]%'
      and (a.cobranca_id = c.id or exists (
        select 1 from public.acordo_cobrancas ac where ac.acordo_id = a.id and ac.cobranca_id = c.id
      )))
    and (c.status is distinct from 'acordo_quebrado' or c.status_operacional is distinct from 'acordo_quebrado')
), alteradas as (
  update public.cobrancas c set status = 'acordo_quebrado', status_operacional = 'acordo_quebrado'
  from alvos a where c.id = a.id returning c.id
)
insert into public.timeline_operacional (
  carteira_id,entidade_tipo,entidade_id,evento_tipo,titulo,descricao,cobranca_id,
  condominio_id,unidade_id,status_anterior,status_novo,origem,payload
)
select a.carteira_id,'cobranca',a.id,'cobranca.acordo_quebrado','Cobrança vinculada a acordo quebrado',
  'Status solicitado pelo usuário: sem flows e sem seleção para novo acordo.',a.id,a.condominio_id,a.unidade_id,
  a.status_operacional,'acordo_quebrado','manual',
  jsonb_build_object('autorizacao','Solicitação do usuário em 21/10/2026','antes',
    jsonb_build_object('status',a.status,'status_operacional',a.status_operacional,'status_financeiro',a.status_financeiro))
from alvos a join alteradas m on m.id = a.id;
