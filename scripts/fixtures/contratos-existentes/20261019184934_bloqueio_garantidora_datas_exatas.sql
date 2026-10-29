begin;

alter table public.condominios
  drop constraint if exists condominios_bloqueio_garantidora_periodo_check;

alter table public.condominios
  add constraint condominios_bloqueio_garantidora_periodo_check check (
    not bloqueio_garantidora_habilitado
    or (
      bloqueio_garantidora_inicio is not null
      and bloqueio_garantidora_fim is not null
      and bloqueio_garantidora_inicio <= bloqueio_garantidora_fim
    )
  );

comment on column public.condominios.bloqueio_garantidora_inicio is
  'Data inicial inclusiva: comparar com o vencimento exato da cota, sem expandir para o mês.';
comment on column public.condominios.bloqueio_garantidora_fim is
  'Data final inclusiva: comparar com o vencimento exato da cota, sem expandir para o mês.';

-- Não recalcula cobranças existentes nem altera os períodos cadastrados.
commit;
