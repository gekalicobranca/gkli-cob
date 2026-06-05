-- Bloqueia escrita futura na tabela legada de parcelas de acordo.
-- Pre-condicao validada em 2026-06-05:
-- - public.parcelas_acordo: 0 registros
-- - public.acordos_parcelas: 0 registros
--
-- A fonte de verdade operacional e public.parcelas_acordo.
-- public.acordos_parcelas fica somente leitura para compatibilidade/historico.

create or replace function public.bloquear_escrita_acordos_parcelas_legado()
returns trigger
language plpgsql
as $$
begin
  raise exception 'public.acordos_parcelas e legado somente leitura. Use public.parcelas_acordo.';
end;
$$;

do $$
begin
  if to_regclass('public.acordos_parcelas') is not null then
    drop trigger if exists bloquear_escrita_acordos_parcelas_legado_trg
      on public.acordos_parcelas;

    create trigger bloquear_escrita_acordos_parcelas_legado_trg
      before insert or update or delete on public.acordos_parcelas
      for each row
      execute function public.bloquear_escrita_acordos_parcelas_legado();

    comment on table public.acordos_parcelas is
      'Tabela legada/compatibilidade, vazia em 2026-06-05 e bloqueada para escrita. Use public.parcelas_acordo.';
  end if;
end;
$$;

comment on table public.parcelas_acordo is
  'Fonte de verdade operacional para parcelas de acordo no app GKLI Cob.';
