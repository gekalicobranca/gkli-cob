alter table public.agente_execucoes
  add column if not exists agendado_para timestamptz;

comment on column public.agente_execucoes.agendado_para is
  'Quando preenchido, o worker só pode iniciar a execução após este instante. Permite testes e filas programadas sem duplicar a agenda mensal.';

create index if not exists agente_execucoes_pendentes_agendamento_idx
  on public.agente_execucoes (agendado_para, created_at)
  where status = 'pendente';
