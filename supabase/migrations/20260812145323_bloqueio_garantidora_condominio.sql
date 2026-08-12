alter table public.condominios
  add column if not exists bloqueio_garantidora_habilitado boolean not null default false,
  add column if not exists bloqueio_garantidora_inicio date,
  add column if not exists bloqueio_garantidora_fim date;

alter table public.condominios
  drop constraint if exists condominios_bloqueio_garantidora_periodo_check;

alter table public.condominios
  add constraint condominios_bloqueio_garantidora_periodo_check check (
    not bloqueio_garantidora_habilitado
    or (
      bloqueio_garantidora_inicio is not null
      and bloqueio_garantidora_fim is not null
      and bloqueio_garantidora_inicio <= bloqueio_garantidora_fim
      and bloqueio_garantidora_inicio = date_trunc('month', bloqueio_garantidora_inicio)::date
      and bloqueio_garantidora_fim = date_trunc('month', bloqueio_garantidora_fim)::date
    )
  );

comment on column public.condominios.bloqueio_garantidora_habilitado is
  'Quando habilitado, cotas do periodo da garantidora entram suspensas na importacao.';
