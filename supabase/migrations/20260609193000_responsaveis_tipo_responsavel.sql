-- Responsaveis por unidade: classifica o responsavel como proprietario ou inquilino.

alter table if exists public.responsaveis_unidades
  add column if not exists tipo_responsavel text not null default 'nao_informado';

update public.responsaveis_unidades
set tipo_responsavel = 'nao_informado'
where tipo_responsavel is null
   or tipo_responsavel = '';

do $$
begin
  if to_regclass('public.responsaveis_unidades') is not null then
    alter table public.responsaveis_unidades
      drop constraint if exists responsaveis_unidades_tipo_responsavel_check;

    alter table public.responsaveis_unidades
      add constraint responsaveis_unidades_tipo_responsavel_check
      check (tipo_responsavel in ('proprietario', 'inquilino', 'nao_informado'));
  end if;
end $$;

create index if not exists responsaveis_unidades_tipo_responsavel_idx
  on public.responsaveis_unidades (tipo_responsavel);
