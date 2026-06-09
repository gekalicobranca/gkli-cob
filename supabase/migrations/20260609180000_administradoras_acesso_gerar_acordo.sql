-- Administradoras: flag operacional para acesso/geracao de acordo.
-- Tambem deixa explicito que mensagens de boleto podem nascer sem destinatario.

alter table if exists public.administradoras
  add column if not exists acesso_gerar_acordo boolean not null default false;

create index if not exists administradoras_acesso_gerar_acordo_idx
  on public.administradoras (acesso_gerar_acordo);

do $$
begin
  if to_regclass('public.mensagens') is not null then
    if exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'mensagens'
        and column_name = 'destinatario'
    ) then
      alter table public.mensagens
        alter column destinatario drop not null;
    end if;

    if exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'mensagens'
        and column_name = 'email_destinatario'
    ) then
      alter table public.mensagens
        alter column email_destinatario drop not null;
    end if;
  end if;
end $$;
