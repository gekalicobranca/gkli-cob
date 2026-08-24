alter table public.lotes
  drop constraint if exists lotes_tipo_check;

alter table public.lotes
  add constraint lotes_tipo_check
  check (
    tipo in (
      'regua_cobranca',
      'regua_acordo',
      'pre_juridico',
      'mensageria',
      'importacao'
    )
  );
