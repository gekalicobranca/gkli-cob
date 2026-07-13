do $$
begin
  if to_regclass('public.parcelas_acordo') is not null then
    alter table public.parcelas_acordo
      drop constraint if exists parcelas_acordo_numero_check;

    alter table public.parcelas_acordo
      add constraint parcelas_acordo_numero_check
      check (numero >= 0);
  end if;
end $$;

