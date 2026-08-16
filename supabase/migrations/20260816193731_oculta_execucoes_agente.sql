alter table public.agente_execucoes
  add column if not exists oculto_em timestamptz;

comment on column public.agente_execucoes.oculto_em is
  'Remove a execucao das listas operacionais sem apagar o marcador da agenda mensal.';

create index if not exists agente_execucoes_visiveis_carteira_created_idx
  on public.agente_execucoes (carteira_id, created_at desc)
  where oculto_em is null;
