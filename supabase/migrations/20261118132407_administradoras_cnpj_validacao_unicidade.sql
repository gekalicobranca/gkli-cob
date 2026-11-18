begin;

-- Keep only official separators out of the identity key; preserve letters and compare uppercase.
create or replace function public.normalizar_cnpj(p_cnpj text)
returns text
language sql
immutable
parallel safe
as $$
  select upper(replace(replace(replace(btrim(coalesce(p_cnpj, '')), '.', ''), '/', ''), '-', ''));
$$;

-- RFB/SERPRO algorithm: ASCII value minus 48, modulo 11, weights 2..9 from right to left.
create or replace function public.cnpj_valido(p_cnpj text)
returns boolean
language plpgsql
immutable
parallel safe
as $$
declare
  v_cnpj text := public.normalizar_cnpj(p_cnpj);
  v_sum integer;
  v_remainder integer;
  v_first integer;
  v_second integer;
  v_weights integer[] := array[5,4,3,2,9,8,7,6,5,4,3,2];
  i integer;
begin
  if v_cnpj !~ '^[A-Z0-9]{12}[0-9]{2}$'
    or v_cnpj ~ '^([0-9])\1{13}$' then
    return false;
  end if;

  v_sum := 0;
  for i in 1..12 loop
    v_sum := v_sum + (ascii(substring(v_cnpj from i for 1)) - 48) * v_weights[i];
  end loop;
  v_remainder := v_sum % 11;
  v_first := case when v_remainder < 2 then 0 else 11 - v_remainder end;

  v_weights := array[6,5,4,3,2,9,8,7,6,5,4,3,2];
  v_sum := 0;
  for i in 1..13 loop
    v_sum := v_sum + (ascii(substring(v_cnpj from i for 1)) - 48) * v_weights[i];
  end loop;
  v_remainder := v_sum % 11;
  v_second := case when v_remainder < 2 then 0 else 11 - v_remainder end;

  return substring(v_cnpj from 13 for 1)::integer = v_first
     and substring(v_cnpj from 14 for 1)::integer = v_second;
end;
$$;

-- Both preflights run before the old condominium index is dropped. Abort without data changes.
do $$
begin
  if exists (
    select 1 from public.administradoras
    where cnpj is not null and btrim(cnpj) <> ''
      and not public.cnpj_valido(cnpj)
  ) then
    raise exception 'Migration blocked: existem CNPJs preenchidos inválidos em administradoras; revise os dados antes de aplicar.';
  end if;

  if exists (
    select 1
    from public.administradoras
    where cnpj is not null and btrim(cnpj) <> ''
    group by public.normalizar_cnpj(cnpj)
    having count(*) > 1
  ) then
    raise exception 'Migration blocked: existem CNPJs duplicados após normalização no cadastro global de administradoras; revise os dados antes de aplicar.';
  end if;

  if exists (
    select 1
    from public.condominios
    where cnpj is not null and btrim(cnpj) <> ''
    group by carteira_id,
      lower(btrim(regexp_replace(coalesce(administradora, ''), '\s+', ' ', 'g'))),
      public.normalizar_cnpj(cnpj)
    having count(*) > 1
  ) then
    raise exception 'Migration blocked: existem CNPJs duplicados após normalização na mesma carteira e administradora; revise os dados antes de aplicar.';
  end if;

  if exists (
    select 1 from public.condominios
    where cnpj is not null and btrim(cnpj) <> ''
      and public.normalizar_cnpj(cnpj) !~ '^[A-Z0-9]{12}[0-9]{2}$'
  ) then
    raise exception 'Migration blocked: existem CNPJs de condomínio com formato estrutural inválido; revise os dados antes de aplicar.';
  end if;
end;
$$;

alter table public.administradoras
  add constraint administradoras_cnpj_dv_check
  check (
    cnpj is null
    or btrim(cnpj) = ''
    or public.cnpj_valido(cnpj)
  );

create unique index administradoras_cnpj_normalizado_uidx
  on public.administradoras (public.normalizar_cnpj(cnpj))
  where cnpj is not null and btrim(cnpj) <> '';

-- Replace the old text-length rule with the 14-position numeric/alphanumeric CNPJ shape.
alter table public.condominios
  drop constraint if exists condominios_cnpj_len_check;
alter table public.condominios
  add constraint condominios_cnpj_len_check
  check (
    cnpj is null
    or btrim(cnpj) = ''
    or public.normalizar_cnpj(cnpj) ~ '^[A-Z0-9]{12}[0-9]{2}$'
  );

-- The historical index is global; replace it with the agreed wallet + administrator scope.
-- The preflight above protects against collisions hidden by punctuation or letter case.
drop index if exists public.condominios_cnpj_key;

create unique index condominios_carteira_administradora_cnpj_uidx
  on public.condominios (
    carteira_id,
    lower(btrim(regexp_replace(coalesce(administradora, ''), '\s+', ' ', 'g'))),
    public.normalizar_cnpj(cnpj)
  )
  where cnpj is not null and btrim(cnpj) <> '';

-- Preserve the known invalid legacy value on unrelated edits. Any new or changed value must pass DV.
create or replace function public.validar_cnpj_condominio()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE'
    and public.normalizar_cnpj(new.cnpj) is not distinct from public.normalizar_cnpj(old.cnpj) then
    return new;
  end if;
  if new.cnpj is not null and btrim(new.cnpj) <> ''
    and not public.cnpj_valido(new.cnpj) then
    raise exception 'CNPJ do condomínio inválido.' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger validar_cnpj_condominio
  before insert or update of cnpj on public.condominios
  for each row execute function public.validar_cnpj_condominio();

comment on function public.normalizar_cnpj(text) is
  'Remove apenas os separadores oficiais do CNPJ e padroniza letras em maiúsculas, preservando a chave alfanumérica.';
comment on function public.cnpj_valido(text) is
  'Valida CNPJ numérico ou alfanumérico conforme o cálculo de DV da Receita Federal/SERPRO.';
comment on index public.administradoras_cnpj_normalizado_uidx is
  'Impede CNPJs duplicados após normalização no cadastro global de administradoras.';
comment on index public.condominios_carteira_administradora_cnpj_uidx is
  'Impede CNPJs duplicados após normalização dentro da mesma carteira e administradora.';

commit;
