-- Revisao do fluxo de criacao de acordo: e-mail interno do acordo.
-- Corrige a divergencia entre os contextos gravados pelo app e o check
-- constraint mensagens_contexto_check_v1 encontrado no banco live.

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
          'acordo_boletos_administradora'
        )
      ) not valid;
  end if;
end $$;

do $$
begin
  if to_regclass('public.mensagens') is not null
    and not exists (
      select 1
      from pg_policies
      where schemaname = 'public'
        and tablename = 'mensagens'
        and policyname = 'mensagens_authenticated_all'
    )
  then
    create policy mensagens_authenticated_all
      on public.mensagens
      for all
      to authenticated
      using (true)
      with check (true);
  end if;
end $$;
