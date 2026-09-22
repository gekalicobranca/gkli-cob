begin;
alter table public.maestro_flow_montagens add column if not exists arquivado_em timestamptz;
comment on column public.maestro_flow_montagens.arquivado_em is
  'Oculta a montagem concluída da lista operacional sem remover flows ou histórico. Retomar limpa este campo.';
commit;
