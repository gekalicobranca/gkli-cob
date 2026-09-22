begin;

-- Bloqueia novas cópias sem alterar, eleger ou apagar cobranças já existentes.
-- A unidade identifica o condomínio/bloco; mudança de carteira não cria outro débito.
create function public.cobranca_recibo_identidade(observacao text)
returns text language sql immutable parallel safe set search_path = pg_catalog as $$
  select case when m[2] ~ '[0-9]' then upper(m[2]) end
  from (select regexp_match(observacao,
    '\yrecibo(?:\s*:\s*|\s+)(?:(AE|AJ|J|A|D|B|P)\s+)?([a-z0-9][a-z0-9._/-]*)(?=\s|\||$)', 'i') m) s;
$$;

create table public.cobrancas_recibo_guard (
  unidade_id uuid not null,
  recibo text not null,
  registros bigint not null check (registros >= 0),
  primary key (unidade_id, recibo)
);
alter table public.cobrancas_recibo_guard enable row level security;
revoke all on public.cobrancas_recibo_guard from public, anon, authenticated, service_role;
comment on table public.cobrancas_recibo_guard is
  'Contador transacional de identidades existentes; não escolhe cobrança canônica. Manipulado exclusivamente pelos triggers de cobrancas.';

lock table public.cobrancas in share row exclusive mode;
insert into public.cobrancas_recibo_guard(unidade_id, recibo, registros)
select unidade_id, public.cobranca_recibo_identidade(observacoes), count(*)
from public.cobrancas
where unidade_id is not null and public.cobranca_recibo_identidade(observacoes) is not null
group by unidade_id, public.cobranca_recibo_identidade(observacoes);

create function public.manter_cobrancas_recibo_guard()
returns trigger language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  recibo_antigo text;
  recibo_novo text;
begin
  if TG_OP <> 'INSERT' then recibo_antigo := public.cobranca_recibo_identidade(OLD.observacoes); end if;
  if TG_OP <> 'DELETE' then recibo_novo := public.cobranca_recibo_identidade(NEW.observacoes); end if;
  if TG_OP = 'UPDATE' then
    if OLD.unidade_id is not distinct from NEW.unidade_id and recibo_antigo is not distinct from recibo_novo then
      return NEW;
    end if;
  end if;
  if TG_OP <> 'INSERT' and OLD.unidade_id is not null and recibo_antigo is not null then
    update public.cobrancas_recibo_guard set registros = registros - 1
      where unidade_id = OLD.unidade_id and recibo = recibo_antigo;
    if not found then raise exception 'Inventário de recibos inconsistente; operação interrompida.'; end if;
    delete from public.cobrancas_recibo_guard
      where unidade_id = OLD.unidade_id and recibo = recibo_antigo and registros = 0;
  end if;
  if TG_OP <> 'DELETE' and NEW.unidade_id is not null and recibo_novo is not null then
    begin
      -- A PK arbitra também transações concorrentes; conflito desfaz toda a escrita.
      insert into public.cobrancas_recibo_guard values (NEW.unidade_id, recibo_novo, 1);
    exception when unique_violation then
      raise exception using errcode = '23505',
        message = 'Recibo já cadastrado nesta unidade. Revise a cobrança existente antes de importar.',
        constraint = 'cobrancas_recibo_guard_pkey';
    end;
  end if;
  if TG_OP = 'DELETE' then return OLD; end if;
  return NEW;
end;
$$;
revoke all on function public.manter_cobrancas_recibo_guard() from public, anon, authenticated, service_role;

create trigger cobrancas_recibo_guard_insert after insert on public.cobrancas
for each row execute function public.manter_cobrancas_recibo_guard();
create trigger cobrancas_recibo_guard_update after update of unidade_id, observacoes on public.cobrancas
for each row execute function public.manter_cobrancas_recibo_guard();
create trigger cobrancas_recibo_guard_delete after delete on public.cobrancas
for each row execute function public.manter_cobrancas_recibo_guard();

commit;
