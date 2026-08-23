alter table public.pre_juridico_casos
  add column if not exists procuracao_lote_id uuid null references public.lotes(id) on delete set null,
  add column if not exists procuracao_lote_criado_em timestamptz null;

create index if not exists pre_juridico_casos_procuracao_lote_id_idx
  on public.pre_juridico_casos (procuracao_lote_id)
  where procuracao_lote_id is not null;

comment on column public.pre_juridico_casos.procuracao_lote_id is
  'Lote da régua criado para enviar a procuração gerada ao síndico.';
