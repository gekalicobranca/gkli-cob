-- Define qual contato a regua deve priorizar ao gerar mensagens.

alter table if exists public.reguas
  add column if not exists destinatario_preferencial text not null default 'proprietario';

update public.reguas
set destinatario_preferencial = 'proprietario'
where destinatario_preferencial is null
   or destinatario_preferencial = '';

do $$
begin
  if to_regclass('public.reguas') is not null then
    alter table public.reguas
      drop constraint if exists reguas_destinatario_preferencial_check;

    alter table public.reguas
      add constraint reguas_destinatario_preferencial_check
      check (destinatario_preferencial in ('proprietario', 'inquilino', 'qualquer'));
  end if;
end $$;

create index if not exists reguas_destinatario_preferencial_idx
  on public.reguas (destinatario_preferencial);
