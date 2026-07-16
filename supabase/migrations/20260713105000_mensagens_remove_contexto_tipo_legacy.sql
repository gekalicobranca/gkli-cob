do $$
begin
  if to_regclass('public.mensagens') is not null then
    alter table public.mensagens
      drop constraint if exists mensagens_contexto_tipo_check;
  end if;
end $$;

