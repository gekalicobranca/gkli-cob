do $$
begin
  if to_regclass('public.reguas') is not null then
    alter table public.reguas
      drop constraint if exists reguas_tipo_check;

    alter table public.reguas
      add constraint reguas_tipo_check
      check (tipo in ('cobranca', 'acordo', 'juridico'));
  end if;
end $$;

