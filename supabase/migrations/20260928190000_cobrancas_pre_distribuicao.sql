begin;

-- Preserve legacy aliases accepted by the existing constraints.
do $$
declare item record;
begin
  for item in
    select conname, pg_get_constraintdef(oid) as definition
    from pg_constraint
    where conrelid = 'public.cobrancas'::regclass
      and conname in ('cobrancas_status_check', 'cobrancas_status_operacional_check')
  loop
    execute format('alter table public.cobrancas drop constraint %I', item.conname);
    execute format('alter table public.cobrancas add constraint %I %s', item.conname,
      replace(item.definition, '''pre_juridico''::text', '''pre_distribuicao''::text, ''pre_juridico''::text'));
  end loop;
end $$;

create or replace function public.classificar_pre_distribuicao()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.duplicada_de_id is not null
     or coalesce(new.status_operacional, new.status) not in ('pre_distribuicao', 'pre_juridico')
     or coalesce(new.status_financeiro, '') in ('quitado', 'pago', 'cancelado', 'renegociado') then
    return new;
  end if;

  -- Acordos quebrados mantêm seu fluxo próprio de encaminhamento.
  if exists (select 1 from public.acordos a where a.cobranca_id = new.id)
     or exists (select 1 from public.acordo_cobrancas a where a.cobranca_id = new.id) then
    if new.status_operacional = 'pre_distribuicao' then
      raise exception 'Pré-distribuição é destinado a cobranças sem acordo.';
    end if;
    return new;
  end if;

  new.status_operacional := case when exists (
    select 1 from public.pre_juridico_casos p
    where p.carteira_id = new.carteira_id and p.condominio_id = new.condominio_id
      and p.unidade_id = new.unidade_id
      and p.etapa not in ('encerrado', 'cancelado', 'arquivado', 'judicializado')
      and p.procuracao_status in ('gerada', 'enviada', 'assinada')
      and p.certidao_status in ('solicitada', 'recebida')
  ) then 'pre_juridico' else 'pre_distribuicao' end;
  new.status := new.status_operacional;
  return new;
end $$;

create trigger zz_classificar_pre_distribuicao
before insert or update of status, status_operacional on public.cobrancas
for each row execute function public.classificar_pre_distribuicao();

create or replace function public.sincronizar_documentos_pre_distribuicao()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update public.cobrancas c set status = c.status_operacional
  where c.carteira_id = new.carteira_id and c.condominio_id = new.condominio_id
    and c.unidade_id = new.unidade_id and c.duplicada_de_id is null
    and c.status_operacional in ('pre_distribuicao', 'pre_juridico')
    and not exists (select 1 from public.acordos a where a.cobranca_id = c.id)
    and not exists (select 1 from public.acordo_cobrancas a where a.cobranca_id = c.id);
  return new;
end $$;

create trigger sincronizar_documentos_pre_distribuicao
after insert or update of procuracao_status, certidao_status, etapa on public.pre_juridico_casos
for each row execute function public.sincronizar_documentos_pre_distribuicao();

-- Include the new status when an entire unit becomes judicialized.
do $$
declare source text;
begin
  source := pg_get_functiondef('public.propagar_acao_judicial_da_unidade()'::regprocedure);
  execute replace(source, '''possivel_acordo'', ''pre_juridico''',
    '''possivel_acordo'', ''pre_distribuicao'', ''pre_juridico''');
end $$;

revoke all on function public.classificar_pre_distribuicao(), public.sincronizar_documentos_pre_distribuicao() from public, anon, authenticated;

-- Reclassify only open, canonical debts without agreements.
update public.cobrancas c set status = c.status_operacional
where c.status_operacional = 'pre_juridico' and c.duplicada_de_id is null
  and coalesce(c.status_financeiro, '') not in ('quitado', 'pago', 'cancelado', 'renegociado')
  and not exists (select 1 from public.acordos a where a.cobranca_id = c.id)
  and not exists (select 1 from public.acordo_cobrancas a where a.cobranca_id = c.id);

commit;
