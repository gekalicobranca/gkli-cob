alter table public.condominios
  add column if not exists operacao_virtual_habilitada boolean not null default false;

comment on column public.condominios.operacao_virtual_habilitada is
  'Permite que a operadora virtual Keila considere o condomínio em filas, lotes e tarefas supervisionadas.';
