begin;
-- Controle de participação no envio; mantém consultas e histórico acessíveis.
alter table public.carteiras add column fiscal_core_habilitado boolean not null default true;
comment on column public.carteiras.fiscal_core_habilitado is 'Participa da fila de ordens do Fiscal do Core. Não controla outros emissores.';

create or replace function public.fiscal_core_preparar(p_periodo_id uuid)
returns integer language plpgsql security definer set search_path='' as $$
declare v_status text; v_count integer;
begin
  select status into v_status from public.fechamento_periodos where id=p_periodo_id for update;
  if v_status is distinct from 'fechado' then raise exception 'Somente fechamentos fechados podem enviar ordens ao Fiscal.'; end if;
  if not exists(select 1 from public.profiles where id=auth.uid() and role in ('admin','gestor')) then raise insufficient_privilege; end if;
  delete from public.fiscal_core_envios e where e.periodo_id=p_periodo_id and e.payload is null
    and e.status<>'processando' and public.fiscal_core_pode_operar(e.carteira_id)
    and not exists(select 1 from public.fechamento_faturamentos_omie f where f.periodo_id=e.periodo_id
      and f.carteira_id=e.carteira_id and f.condominio_id=e.condominio_id and f.tipo_faturamento=e.tipo_faturamento
      and exists(select 1 from public.carteiras c where c.id=f.carteira_id and c.fiscal_core_habilitado)
      and f.status='pendente' and f.valor_faturamento>0 and coalesce(f.nfse_status,'pendente_dados') not in ('autorizado','enviado','cancelado'));
  insert into public.fiscal_core_envios(periodo_id,carteira_id,condominio_id,tipo_faturamento,source_id,snapshot,criado_por)
  select f.periodo_id,f.carteira_id,f.condominio_id,f.tipo_faturamento,
    'cob:'||f.periodo_id||':'||f.carteira_id||':'||f.condominio_id||':'||f.tipo_faturamento,
    jsonb_build_object('periodo_id',f.periodo_id,'carteira_id',f.carteira_id,'condominio_id',f.condominio_id,
      'tipo_faturamento',f.tipo_faturamento,'competencia',p.competencia,
      'emissor_razao_social',f.emissor_razao_social,'emissor_cnpj',f.emissor_cnpj,
      'tomador_razao_social',f.tomador_razao_social,'tomador_cnpj',f.tomador_cnpj,
      'valor_faturamento',f.valor_faturamento::text), auth.uid()
  from public.fechamento_faturamentos_omie f join public.fechamento_periodos p on p.id=f.periodo_id
  where f.periodo_id=p_periodo_id and f.status='pendente' and f.valor_faturamento>0
    and coalesce(f.nfse_status,'pendente_dados') not in ('autorizado','enviado','cancelado')
    and exists(select 1 from public.carteiras c where c.id=f.carteira_id and c.fiscal_core_habilitado)
    and f.condominio_id is not null and public.fiscal_core_pode_operar(f.carteira_id)
  on conflict(source_id) do update set snapshot=excluded.snapshot,status='pendente',erro=null,updated_at=now()
    where fiscal_core_envios.payload is null and fiscal_core_envios.status <> 'processando';
  get diagnostics v_count=row_count;
  return v_count;
end;
$$;

create or replace function public.fiscal_core_reivindicar(p_periodo_id uuid,p_excluir uuid[] default '{}')
returns setof public.fiscal_core_envios language plpgsql security definer set search_path='' as $$
begin
  perform 1 from public.fechamento_periodos where id=p_periodo_id and status='fechado' for update;
  if not found then return; end if;
  return query
    update public.fiscal_core_envios e set status='processando',claim_id=gen_random_uuid(),lease_ate=now()+interval '2 minutes',
      tentativas=tentativas+1,updated_at=now()
    where e.id=(select q.id from public.fiscal_core_envios q where q.periodo_id=p_periodo_id
      and exists(select 1 from public.carteiras c where c.id=q.carteira_id and c.fiscal_core_habilitado)
      and public.fiscal_core_pode_operar(q.carteira_id) and not(q.id=any(p_excluir))
      and (q.status in ('pendente','erro') or (q.status='processando' and q.lease_ate<now()))
      order by q.updated_at,q.id for update skip locked limit 1)
    returning e.*;
end;
$$;

create or replace function public.fiscal_core_salvar_payload(p_id uuid,p_claim_id uuid,p_payload jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_row public.fiscal_core_envios; v_periodo_id uuid; v_competencia text;
begin
  select periodo_id into strict v_periodo_id from public.fiscal_core_envios where id=p_id and public.fiscal_core_pode_operar(carteira_id);
  select competencia into v_competencia from public.fechamento_periodos where id=v_periodo_id and status='fechado' for update;
  if not found then raise exception 'Fechamento reaberto ou indisponível para envio.'; end if;
  select * into strict v_row from public.fiscal_core_envios where id=p_id and claim_id=p_claim_id
    and status='processando' and lease_ate>now() and public.fiscal_core_pode_operar(carteira_id) for update;
  perform 1 from public.carteiras where id=v_row.carteira_id and fiscal_core_habilitado for share;
  if not found then raise exception 'Carteira não envia ordens ao Fiscal do Core.'; end if;
  perform 1 from public.fechamento_faturamentos_omie f where f.periodo_id=v_row.periodo_id
    and f.carteira_id=v_row.carteira_id and f.condominio_id=v_row.condominio_id and f.tipo_faturamento=v_row.tipo_faturamento
    and f.status='pendente' and coalesce(f.nfse_status,'pendente_dados') not in ('autorizado','enviado','cancelado')
    and jsonb_build_object('periodo_id',f.periodo_id,'carteira_id',f.carteira_id,'condominio_id',f.condominio_id,
      'tipo_faturamento',f.tipo_faturamento,'competencia',v_competencia,
      'emissor_razao_social',f.emissor_razao_social,'emissor_cnpj',f.emissor_cnpj,
      'tomador_razao_social',f.tomador_razao_social,'tomador_cnpj',f.tomador_cnpj,
      'valor_faturamento',f.valor_faturamento::text)=v_row.snapshot for update;
  if not found then raise exception 'Base alterada desde a preparação. Prepare a fila novamente.'; end if;
  if p_payload->>'source_id' is distinct from v_row.source_id
    or p_payload->>'fechamento_id' is distinct from v_row.periodo_id::text
    or p_payload->>'condominio_id' is distinct from v_row.condominio_id::text then raise exception 'Referência de origem inválida.'; end if;
  if v_row.payload is not null then
    if v_row.payload is distinct from p_payload then raise exception 'Payload já congelado.'; end if;
    return v_row.payload;
  end if;
  update public.fiscal_core_envios set payload=p_payload,updated_at=now() where id=p_id;
  return p_payload;
end;
$$;

notify pgrst,'reload schema';
commit;
