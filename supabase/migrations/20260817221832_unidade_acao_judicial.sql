alter table public.unidades
  add column if not exists acao_judicial boolean not null default false;

comment on column public.unidades.acao_judicial is
  'Indica que a unidade possui ação judicial e não pode seguir em cobrança ou receber novos acordos.';

create or replace function public.aplicar_acao_judicial_em_cobranca()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.unidade_id is not null and exists (
    select 1 from public.unidades u
    where u.id = new.unidade_id and u.acao_judicial
  ) then
    new.status := 'judicializado';
    new.status_operacional := 'judicializado';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_aplicar_acao_judicial_em_cobranca on public.cobrancas;
create trigger trg_aplicar_acao_judicial_em_cobranca
before insert or update of unidade_id on public.cobrancas
for each row execute function public.aplicar_acao_judicial_em_cobranca();

create or replace function public.propagar_acao_judicial_da_unidade()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.acao_judicial and not old.acao_judicial then
    update public.cobrancas
       set status = 'judicializado',
           status_operacional = 'judicializado'
     where unidade_id = new.id
       and coalesce(status_operacional, status, 'novo') in (
         'novo', 'em_cobranca_ativa', 'em_negociacao', 'possivel_acordo', 'pre_juridico'
       );
  end if;
  return new;
end;
$$;

drop trigger if exists trg_propagar_acao_judicial_da_unidade on public.unidades;
create trigger trg_propagar_acao_judicial_da_unidade
after update of acao_judicial on public.unidades
for each row execute function public.propagar_acao_judicial_da_unidade();

create or replace function public.bloquear_acordo_para_unidade_judicial()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.unidade_id is not null and exists (
    select 1 from public.unidades u
    where u.id = new.unidade_id and u.acao_judicial
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'Unidade com ação judicial: não é permitido criar um novo acordo.';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_bloquear_acordo_para_unidade_judicial on public.acordos;
create trigger trg_bloquear_acordo_para_unidade_judicial
before insert or update of unidade_id on public.acordos
for each row execute function public.bloquear_acordo_para_unidade_judicial();
