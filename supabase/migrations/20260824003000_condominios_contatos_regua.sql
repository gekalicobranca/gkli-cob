alter table public.condominios
  add column if not exists sindico_email text,
  add column if not exists sindico_celular text,
  add column if not exists gerente_email text,
  add column if not exists gerente_celular text;

comment on column public.condominios.sindico_email is
  'E-mail operacional do síndico usado pelas réguas e pré-jurídico.';

comment on column public.condominios.sindico_celular is
  'Celular operacional do síndico usado pelas réguas e pré-jurídico.';

comment on column public.condominios.gerente_email is
  'E-mail operacional do gerente do condomínio usado pelas réguas.';

comment on column public.condominios.gerente_celular is
  'Celular operacional do gerente do condomínio usado pelas réguas.';
