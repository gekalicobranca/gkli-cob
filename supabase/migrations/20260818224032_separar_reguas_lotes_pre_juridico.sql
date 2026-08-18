alter table public.condominios
  add column if not exists regua_pre_juridico_id uuid null
  references public.reguas(id) on delete set null;

create index if not exists idx_condominios_regua_pre_juridico
  on public.condominios(regua_pre_juridico_id)
  where regua_pre_juridico_id is not null;

-- Os lotes antigos eram tecnicamente gravados como régua de acordo. A marcação
-- no resumo permite separá-los sem perder histórico nem alterar itens/mensagens.
update public.lotes
set tipo = 'pre_juridico'
where tipo = 'regua_acordo'
  and resumo ->> 'contexto' = 'pre_juridico';

create index if not exists idx_lotes_pre_juridico_created_at
  on public.lotes(created_at desc)
  where tipo = 'pre_juridico';
