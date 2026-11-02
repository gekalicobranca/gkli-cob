begin;
alter table public.acordos
  add column sindico_decisao text check (sindico_decisao in ('aprovar','rejeitar')),
  add column sindico_decidido_por uuid references public.profiles(id),
  add column sindico_quantidade_aprovada integer,
  add column credito_administradora_restituido_em timestamptz,
  add column sindico_decisao_observacao text;

create table public.acordos_sindico_decisoes (
  id uuid primary key default gen_random_uuid(),
  acordo_id uuid not null unique references public.acordos(id),
  carteira_id uuid not null,
  decisao text not null check (decisao in ('aprovar','rejeitar')),
  decidido_por uuid not null references public.profiles(id),
  decidido_em timestamptz not null default now(),
  evidencia text not null
);
alter table public.acordos_sindico_decisoes enable row level security;
create policy decisoes_sindico_select on public.acordos_sindico_decisoes
for select to authenticated using (public.current_user_can_access_carteira(carteira_id));
grant select on public.acordos_sindico_decisoes to authenticated;
revoke insert,update,delete on public.acordos_sindico_decisoes from authenticated,anon;

-- Patch the current RPC, retaining receipt locks, duplicate checks and multi-unit scope.
do $migration$
declare src text; anchor text := '  insert into public.acordos (';
begin
  src := replace(pg_get_functiondef('public.criar_acordo_financeiro(uuid,uuid,uuid,uuid,text,text,numeric,numeric,numeric,numeric,date,text,text,boolean,text,text,jsonb,jsonb,text)'::regprocedure), E'\r', '');
  if position(anchor in src)=0 or position('  v_acordo_id uuid;' in src)=0 then
    raise exception 'Estrutura da RPC financeira alterada; revisar migração de aprovação.';
  end if;
  src := replace(src, '  v_acordo_id uuid;', E'  v_limite_sindico integer;\n  v_quantidade_sindico integer;\n  v_acordo_id uuid;');
  src := replace(src, anchor, $guard$
  -- The current condominium configuration, never the browser, decides approval.
  if exists(select 1 from jsonb_array_elements(p_parcelas) p
    where coalesce(p->>'vencimento','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$') then
    raise exception 'Vencimento inválido: use YYYY-MM-DD.';
  end if;
  if (select count(*) from jsonb_array_elements(p_parcelas) p where p->>'tipo_parcela'='entrada')>1
    or exists(select 1 from jsonb_array_elements(p_parcelas) p
      where coalesce(p->>'tipo_parcela','parcela') not in ('entrada','parcela')
        or (p->>'tipo_parcela'='entrada' and coalesce((p->>'numero')::integer,-1)<>0)
        or (coalesce(p->>'tipo_parcela','parcela')='parcela' and coalesce((p->>'numero')::integer,0)<=0)) then
    raise exception 'Plano inválido: use uma entrada de número zero e parcelas numeradas.';
  end if;
  select parcelas_acordo_sem_aprovacao_sindico into v_limite_sindico
  from public.condominios where id=p_condominio_id and carteira_id=p_carteira_id for share;
  if not found then raise exception 'Condomínio inválido para aprovação.'; end if;
  select count(*) into v_quantidade_sindico from jsonb_array_elements(p_parcelas) p
  where coalesce(p->>'tipo_parcela','parcela') <> 'entrada';
  p_exige_aprovacao_sindico := coalesce(v_limite_sindico,0)>0 and v_quantidade_sindico>v_limite_sindico;
  if p_exige_aprovacao_sindico then
    p_status := 'ativo';
    p_fluxo_status := 'aguardando_aprovacao_sindico';
    p_documento_url := null;
  end if;
$guard$ || anchor);
  execute src;
end $migration$;

create function public.proteger_aprovacao_sindico()
returns trigger language plpgsql security definer set search_path='' as $$
declare decisao_alterada boolean;
begin
  if tg_op='INSERT' then
    new.sindico_aprovado_em := null;
    new.sindico_decisao := null;
    new.sindico_decidido_por := null;
    new.sindico_decisao_observacao := null;
    new.sindico_quantidade_aprovada := null;
    new.credito_administradora_restituido_em := null;
  else
    if coalesce(old.status,'') in ('cancelado','quitado','rompido','quebrado','renegociado')
      and new.credito_administradora_utilizado is distinct from old.credito_administradora_utilizado then
      raise exception 'Não é permitido reservar crédito em acordo encerrado.';
    end if;
    if old.exige_aprovacao_sindico and not coalesce(new.exige_aprovacao_sindico,false) then
      raise exception 'A exigência de aprovação não pode ser removida.';
    end if;
    decisao_alterada := new.sindico_aprovado_em is distinct from old.sindico_aprovado_em
      or new.sindico_decisao is distinct from old.sindico_decisao
      or new.sindico_decidido_por is distinct from old.sindico_decidido_por
      or new.sindico_decisao_observacao is distinct from old.sindico_decisao_observacao
      or new.sindico_quantidade_aprovada is distinct from old.sindico_quantidade_aprovada
      or new.credito_administradora_restituido_em is distinct from old.credito_administradora_restituido_em;
    if decisao_alterada then
      if not exists(select 1 from public.profiles where id=auth.uid() and role in ('admin','gestor'))
        or public.current_user_can_access_carteira(old.carteira_id) is not true then
        raise exception 'Somente administrador ou gestor pode registrar a decisão do síndico.' using errcode='42501';
      end if;
      if old.fluxo_status is distinct from 'aguardando_aprovacao_sindico'
        or old.exige_aprovacao_sindico is not true or old.sindico_aprovado_em is not null
        or old.sindico_decisao is not null
        or coalesce(old.status,'') in ('cancelado','quitado','rompido','quebrado','renegociado') then
        raise exception 'Este acordo não está aguardando decisão do síndico.';
      end if;
      if new.sindico_decisao is null or new.sindico_decisao not in ('aprovar','rejeitar')
        or length(trim(coalesce(new.sindico_decisao_observacao,''))) < 3 then
        raise exception 'Registre a decisão e a evidência da aprovação/rejeição do síndico.';
      end if;
      new.sindico_decidido_por := auth.uid();
      if new.sindico_decisao='aprovar' then
        new.sindico_aprovado_em := now();
        select count(*) into new.sindico_quantidade_aprovada from public.parcelas_acordo
        where acordo_id=old.id and coalesce(tipo_parcela,'parcela')<>'entrada';
        new.fluxo_status := 'aprovado_sindico_aguardando_aceite_devedor';
      else
        new.sindico_aprovado_em := null;
        new.fluxo_status := 'reprovado_sindico';
        new.status := 'cancelado'; -- Financial status retains its existing canonical value.
        if coalesce(old.credito_administradora_utilizado,0)>0 then
          update public.unidades set credito_administradora=credito_administradora+old.credito_administradora_utilizado where id=old.unidade_id;
          new.credito_administradora_restituido_em:=now();
        end if;
      end if;
      insert into public.acordos_sindico_decisoes(acordo_id,carteira_id,decisao,decidido_por,evidencia)
      values (old.id,old.carteira_id,new.sindico_decisao,auth.uid(),new.sindico_decisao_observacao);
    end if;
  end if;
  if new.exige_aprovacao_sindico and new.sindico_aprovado_em is null then
    if tg_op='INSERT' then new.fluxo_status := 'aguardando_aprovacao_sindico'; end if;
    if new.fluxo_status not in ('aguardando_aprovacao_sindico','reprovado_sindico','cancelado')
      or new.documento_url is not null or new.status in ('quitado','acordo_firmado','acordo_efetivado') then
      raise exception 'Aguarde a aprovação do síndico antes de formalizar ou solicitar boletos.';
    end if;
  end if;
  return new;
end $$;
create trigger proteger_aprovacao_sindico before insert or update on public.acordos
for each row execute function public.proteger_aprovacao_sindico();

create function public.validar_formalizacao_aprovada()
returns trigger language plpgsql security definer set search_path='' as $$
declare a public.acordos; limite integer; quantidade integer; total_parcelas integer;
begin
  if new.acordo_id is null then return new; end if;
  select * into a from public.acordos where id=new.acordo_id for update;
  if not found then raise exception 'Acordo não encontrado para formalização.'; end if;
  if tg_table_name='acordos_termos' and to_jsonb(new)->>'tipo_aceite'='sindico' then return new; end if;
  if tg_table_name='mensagens' and to_jsonb(new)->'payload'->>'tipo_aceite'='sindico' then return new; end if;
  select parcelas_acordo_sem_aprovacao_sindico into limite from public.condominios where id=a.condominio_id;
  select count(*),count(*) filter(where coalesce(tipo_parcela,'parcela')<>'entrada') into total_parcelas,quantidade
    from public.parcelas_acordo where acordo_id=a.id;
  if total_parcelas=0 then raise exception 'Plano de pagamento obrigatório antes da formalização.'; end if;
  if (a.exige_aprovacao_sindico or (coalesce(limite,0)>0 and quantidade>limite)) and a.sindico_aprovado_em is null then
    raise exception 'Formalização e boletos bloqueados até aprovação do síndico.';
  end if;
  return new;
end $$;
create trigger validar_termo_aprovado before insert or update on public.acordos_termos
for each row execute function public.validar_formalizacao_aprovada();
create trigger validar_mensagem_acordo_aprovado before insert or update on public.mensagens
for each row execute function public.validar_formalizacao_aprovada();

-- A direct insertion of extra installments cannot bypass the financial RPC rule.
create function public.validar_parcelas_aprovacao_sindico()
returns trigger language plpgsql security definer set search_path='' as $$
declare a public.acordos; limite integer; quantidade integer;
begin
  select * into a from public.acordos where id=new.acordo_id for update;
  if coalesce(new.tipo_parcela,'parcela') not in ('entrada','parcela')
    or (new.tipo_parcela='entrada' and new.numero is distinct from 0)
    or (coalesce(new.tipo_parcela,'parcela')='parcela' and coalesce(new.numero,0)<=0)
    or (select count(*) from public.parcelas_acordo where acordo_id=a.id and tipo_parcela='entrada')>1 then
    raise exception 'Plano inválido: use uma entrada de número zero e parcelas numeradas.';
  end if;
  select parcelas_acordo_sem_aprovacao_sindico into limite from public.condominios where id=a.condominio_id;
  select count(*) into quantidade from public.parcelas_acordo
  where acordo_id=a.id and coalesce(tipo_parcela,'parcela')<>'entrada';
  if a.sindico_decisao='aprovar' and quantidade>coalesce(a.sindico_quantidade_aprovada,0) then
    raise exception 'Aumento do parcelamento exige nova proposta e aprovação.';
  end if;
  if coalesce(limite,0)>0 and quantidade>limite and not coalesce(a.exige_aprovacao_sindico,false) then
    if exists(select 1 from public.acordos_termos where acordo_id=a.id and tipo_aceite='devedor')
      or exists(select 1 from public.mensagens where acordo_id=a.id) then
      raise exception 'Parcelamento exige aprovação antes da formalização.';
    end if;
    update public.acordos set exige_aprovacao_sindico=true,fluxo_status='aguardando_aprovacao_sindico',documento_url=null where id=a.id;
  end if;
  return new;
end $$;
create trigger validar_parcelas_aprovacao_sindico after insert or update of acordo_id,tipo_parcela,numero on public.parcelas_acordo
for each row execute function public.validar_parcelas_aprovacao_sindico();

create function public.decidir_aprovacao_sindico(p_acordo_id uuid,p_decisao text,p_evidencia text)
returns void language plpgsql security definer set search_path='' as $$
declare a public.acordos;
begin
  if auth.uid() is null or not exists(select 1 from public.profiles where id=auth.uid() and role in ('admin','gestor')) then
    raise exception 'Somente administrador ou gestor pode registrar a decisão do síndico.' using errcode='42501';
  end if;
  select * into a from public.acordos where id=p_acordo_id for update;
  if not found or public.current_user_can_access_carteira(a.carteira_id) is not true then raise exception 'Acordo não encontrado ou sem acesso.'; end if;
  if a.fluxo_status is distinct from 'aguardando_aprovacao_sindico' or a.exige_aprovacao_sindico is not true
    or a.sindico_aprovado_em is not null or a.sindico_decisao is not null
    or coalesce(a.status,'') in ('cancelado','quitado','rompido','quebrado','renegociado') then
    raise exception 'Este acordo não está aguardando decisão do síndico.';
  end if;
  perform 1 from public.parcelas_acordo where acordo_id=a.id order by id for update;
  if exists(select 1 from public.parcelas_acordo where acordo_id=a.id and (data_pagamento is not null or status in ('paga','pago','quitada','quitado'))) then
    raise exception 'Acordo com pagamento exige revisão; os pagamentos foram preservados.';
  end if;
  update public.acordos set sindico_decisao=p_decisao,sindico_decisao_observacao=trim(p_evidencia) where id=a.id;
  if p_decisao='rejeitar' then
    update public.parcelas_acordo set status='cancelada' where acordo_id=a.id and data_pagamento is null and status in ('aberta','pendente','vencida');
    update public.cobrancas c set status='em_cobranca_ativa',status_operacional='em_cobranca_ativa'
    where (c.id=a.cobranca_id or exists(select 1 from public.acordo_cobrancas ac where ac.acordo_id=a.id and ac.cobranca_id=c.id))
      and c.duplicada_de_id is null and coalesce(c.status_operacional,c.status)='em_negociacao'
      and coalesce(c.status_financeiro,'') not in ('pago','quitado','cancelado');
  end if;
end $$;
revoke all on function public.proteger_aprovacao_sindico(),public.validar_formalizacao_aprovada(),public.validar_parcelas_aprovacao_sindico() from public,anon,authenticated;
revoke all on function public.decidir_aprovacao_sindico(uuid,text,text) from public,anon;
grant execute on function public.decidir_aprovacao_sindico(uuid,text,text) to authenticated;
notify pgrst,'reload schema';
commit;
