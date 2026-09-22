begin;

create table public.fiscal_core_envios (
  id uuid primary key default gen_random_uuid(),
  periodo_id uuid not null references public.fechamento_periodos(id) on delete restrict,
  carteira_id uuid not null references public.carteiras(id) on delete restrict,
  condominio_id uuid not null references public.condominios(id) on delete restrict,
  tipo_faturamento text not null,
  source_id text not null unique check (length(source_id) <= 200),
  snapshot jsonb not null,
  payload jsonb,
  status text not null default 'pendente' check (status in ('pendente','processando','enviado','erro','conflito')),
  claim_id uuid,
  lease_ate timestamptz,
  tentativas integer not null default 0,
  ordem_core_id uuid,
  erro text,
  criado_por uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  enviado_em timestamptz,
  unique(periodo_id, carteira_id, condominio_id, tipo_faturamento),
  check (status <> 'enviado' or (ordem_core_id is not null and payload is not null))
);
create index fiscal_core_envios_pendentes_idx on public.fiscal_core_envios(periodo_id,status,created_at);
alter table public.fiscal_core_envios enable row level security;

create function public.fiscal_core_pode_operar(p_carteira_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin','gestor'))
    and public.current_user_can_access_carteira(p_carteira_id);
$$;
revoke all on function public.fiscal_core_pode_operar(uuid) from public,anon;
grant execute on function public.fiscal_core_pode_operar(uuid) to authenticated;
create policy fiscal_core_envios_select on public.fiscal_core_envios for select to authenticated
  using (public.fiscal_core_pode_operar(carteira_id));
revoke all on public.fiscal_core_envios from public,anon,authenticated;
grant select on public.fiscal_core_envios to authenticated;
grant all on public.fiscal_core_envios to service_role;

create function public.fiscal_core_preparar(p_periodo_id uuid)
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
    and f.condominio_id is not null and public.fiscal_core_pode_operar(f.carteira_id)
  on conflict(source_id) do update set snapshot=excluded.snapshot,status='pendente',erro=null,updated_at=now()
    where fiscal_core_envios.payload is null and fiscal_core_envios.status <> 'processando';
  get diagnostics v_count=row_count;
  return v_count;
end;
$$;

create function public.fiscal_core_ao_fechar()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.status='fechado' and old.status is distinct from 'fechado' then perform public.fiscal_core_preparar(new.id); end if;
  return new;
end;
$$;
create trigger fiscal_core_ao_fechar after update of status on public.fechamento_periodos
  for each row execute function public.fiscal_core_ao_fechar();

create function public.fiscal_core_reivindicar(p_periodo_id uuid,p_excluir uuid[] default '{}')
returns setof public.fiscal_core_envios language plpgsql security definer set search_path='' as $$
begin
  perform 1 from public.fechamento_periodos where id=p_periodo_id and status='fechado' for update;
  if not found then return; end if;
  return query
    update public.fiscal_core_envios e set status='processando',claim_id=gen_random_uuid(),lease_ate=now()+interval '2 minutes',
      tentativas=tentativas+1,updated_at=now()
    where e.id=(select q.id from public.fiscal_core_envios q where q.periodo_id=p_periodo_id
      and public.fiscal_core_pode_operar(q.carteira_id) and not(q.id=any(p_excluir))
      and (q.status in ('pendente','erro') or (q.status='processando' and q.lease_ate<now()))
      order by q.updated_at,q.id for update skip locked limit 1)
    returning e.*;
end;
$$;

create function public.fiscal_core_salvar_payload(p_id uuid,p_claim_id uuid,p_payload jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_row public.fiscal_core_envios; v_periodo_id uuid; v_competencia text;
begin
  select periodo_id into strict v_periodo_id from public.fiscal_core_envios where id=p_id and public.fiscal_core_pode_operar(carteira_id);
  select competencia into v_competencia from public.fechamento_periodos where id=v_periodo_id and status='fechado' for update;
  if not found then raise exception 'Fechamento reaberto ou indisponível para envio.'; end if;
  select * into strict v_row from public.fiscal_core_envios where id=p_id and claim_id=p_claim_id
    and status='processando' and lease_ate>now() and public.fiscal_core_pode_operar(carteira_id) for update;
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

create function public.fiscal_core_concluir(p_id uuid,p_claim_id uuid,p_status text,p_ordem_id uuid default null,p_erro text default null)
returns boolean language plpgsql security definer set search_path='' as $$
declare v_row public.fiscal_core_envios;
begin
  if p_status not in ('enviado','erro','conflito') then raise exception 'Status de entrega inválido.'; end if;
  update public.fiscal_core_envios set status=p_status,ordem_core_id=p_ordem_id,erro=left(p_erro,1000),
    enviado_em=case when p_status='enviado' then now() else null end,claim_id=null,lease_ate=null,updated_at=now()
  where id=p_id and claim_id=p_claim_id and status='processando' and public.fiscal_core_pode_operar(carteira_id)
  returning * into v_row;
  if not found then return false; end if;
  insert into public.fechamento_auditoria(periodo_id,user_id,acao,descricao,dados)
    values(v_row.periodo_id,auth.uid(),'fiscal_core_'||p_status,'Entrega ao Fiscal: '||p_status,
      jsonb_build_object('source_id',v_row.source_id,'ordem_core_id',p_ordem_id,'erro',left(p_erro,1000)));
  return true;
end;
$$;

-- Uma tentativa pode ter sido recebida mesmo sem resposta HTTP. A partir do
-- congelamento do payload, alterações exigem conciliação explícita no Fiscal.
create function public.fiscal_core_proteger_origem()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if tg_table_name='fechamento_periodos' then
    if new.status='faturado' and exists(select 1 from public.fiscal_core_envios where periodo_id=old.id and status<>'enviado') then
      raise exception 'Existem entregas pendentes ao Fiscal. Conclua ou concilie a fila antes de marcar faturado.';
    end if;
    if (new.status in ('reaberto','cancelado') or new.competencia is distinct from old.competencia)
      and exists(select 1 from public.fiscal_core_envios where periodo_id=old.id and payload is not null) then
      raise exception 'Este fechamento possui ordens encaminhadas ao Fiscal. Concilie as ordens antes de reabrir ou cancelar.';
    end if;
  else
    if exists(select 1 from public.fiscal_core_envios where periodo_id=old.periodo_id and carteira_id=old.carteira_id
      and condominio_id=old.condominio_id and tipo_faturamento=old.tipo_faturamento and payload is not null) then
      if tg_op='DELETE' then raise exception 'Base encaminhada ao Fiscal não pode ser excluída.'; end if;
      if row(new.periodo_id,new.carteira_id,new.condominio_id,new.tipo_faturamento,new.valor_faturamento,new.emissor_cnpj,new.emissor_razao_social,new.tomador_cnpj,new.tomador_razao_social)
        is distinct from row(old.periodo_id,old.carteira_id,old.condominio_id,old.tipo_faturamento,old.valor_faturamento,old.emissor_cnpj,old.emissor_razao_social,old.tomador_cnpj,old.tomador_razao_social) then
        raise exception 'Base encaminhada ao Fiscal não pode ter valores ou partes alterados.';
      end if;
    end if;
  end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end;
$$;
create trigger fiscal_core_proteger_periodo before update of status,competencia on public.fechamento_periodos for each row execute function public.fiscal_core_proteger_origem();
create trigger fiscal_core_proteger_base before update or delete on public.fechamento_faturamentos_omie for each row execute function public.fiscal_core_proteger_origem();

revoke all on function public.fiscal_core_preparar(uuid),public.fiscal_core_reivindicar(uuid,uuid[]),
  public.fiscal_core_salvar_payload(uuid,uuid,jsonb),public.fiscal_core_concluir(uuid,uuid,text,uuid,text),
  public.fiscal_core_ao_fechar(),public.fiscal_core_proteger_origem() from public,anon;
grant execute on function public.fiscal_core_preparar(uuid),public.fiscal_core_reivindicar(uuid,uuid[]),
  public.fiscal_core_salvar_payload(uuid,uuid,jsonb),public.fiscal_core_concluir(uuid,uuid,text,uuid,text) to authenticated;
notify pgrst,'reload schema';
commit;
