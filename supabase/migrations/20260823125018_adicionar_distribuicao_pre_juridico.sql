alter table public.pre_juridico_casos
  add column if not exists distribuicao_status text null,
  add column if not exists distribuicao_solicitada_em timestamptz null,
  add column if not exists distribuido_em timestamptz null;

update public.pre_juridico_casos
set
  distribuicao_status = 'solicitado',
  distribuicao_solicitada_em = coalesce(distribuicao_solicitada_em, updated_at)
where etapa = 'pronto_juridico'
  and distribuicao_status is null;

update public.pre_juridico_casos
set
  distribuicao_status = 'distribuido',
  distribuicao_solicitada_em = coalesce(distribuicao_solicitada_em, judicializado_em, updated_at),
  distribuido_em = coalesce(distribuido_em, judicializado_em, updated_at)
where etapa = 'judicializado'
  and distribuicao_status is null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'pre_juridico_casos_distribuicao_status_check'
      and conrelid = 'public.pre_juridico_casos'::regclass
  ) then
    alter table public.pre_juridico_casos
      add constraint pre_juridico_casos_distribuicao_status_check
      check (distribuicao_status is null or distribuicao_status in ('solicitado', 'distribuido'));
  end if;
end
$$;

comment on column public.pre_juridico_casos.distribuicao_status is
  'Andamento da distribuição ao jurídico: solicitado ou distribuido.';

create or replace function public.sincronizar_judicializacao_pre_juridico()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if ((new.distribuicao_status = 'distribuido' and old.distribuicao_status is distinct from new.distribuicao_status)
      or (new.etapa = 'judicializado' and old.etapa is distinct from new.etapa))
     and new.unidade_id is not null then
    update public.unidades
       set acao_judicial = true
     where id = new.unidade_id;

    update public.cobrancas
       set status = 'judicializado',
           status_operacional = 'judicializado'
     where unidade_id = new.unidade_id
       and lower(coalesce(status_financeiro, '')) not in ('quitado', 'pago', 'cancelado');
  end if;
  return new;
end;
$$;

drop trigger if exists trg_sincronizar_judicializacao_pre_juridico on public.pre_juridico_casos;
create trigger trg_sincronizar_judicializacao_pre_juridico
after update of etapa, distribuicao_status on public.pre_juridico_casos
for each row execute function public.sincronizar_judicializacao_pre_juridico();
