do $$
begin
  if to_regclass('public.mensagens') is not null then
    alter table public.mensagens
      drop constraint if exists mensagens_contexto_check_v1;

    alter table public.mensagens
      drop constraint if exists mensagens_contexto_check;

    alter table public.mensagens
      add constraint mensagens_contexto_check_v1
      check (
        contexto is null
        or contexto in (
          'cobranca',
          'acordo',
          'regua_cobranca',
          'regua_acordo',
          'mensageria',
          'manual',
          'sistema',
          'administradora',
          'acordo_fluxo',
          'acordo_boletos_administradora',
          'pre_juridico'
        )
      ) not valid;
  end if;
end $$;

