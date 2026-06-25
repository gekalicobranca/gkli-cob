-- Read-path indexes for operational inbox and lot detail screens.

do $$
begin
  if to_regclass('public.acordos') is not null then
    execute 'create index if not exists idx_acordos_carteira_status_data on public.acordos(carteira_id, status, data_acordo desc)';
  end if;

  if to_regclass('public.eventos_operacionais') is not null then
    execute 'create index if not exists idx_eventos_operacionais_cobranca_created on public.eventos_operacionais(cobranca_id, created_at desc) where cobranca_id is not null';
    execute 'create index if not exists idx_eventos_operacionais_acordo_created on public.eventos_operacionais(acordo_id, created_at desc) where acordo_id is not null';
  end if;

  if to_regclass('public.importacoes') is not null then
    execute 'create index if not exists idx_importacoes_carteira_status on public.importacoes(carteira_id, status)';
  end if;

  if to_regclass('public.lotes') is not null then
    execute 'create index if not exists idx_lotes_carteira_status_created on public.lotes(carteira_id, status, created_at desc)';
    execute 'create index if not exists idx_lotes_total_erros on public.lotes(total_erros) where total_erros > 0';
  end if;
end $$;
