-- Read-path indexes for mensageria log and sanity screens.

do $$
begin
  if to_regclass('public.mensageria_logs') is not null then
    execute 'create index if not exists idx_mensageria_logs_status_novo_created on public.mensageria_logs(status_novo, created_at desc)';
    execute 'create index if not exists idx_mensageria_logs_status_anterior_created on public.mensageria_logs(status_anterior, created_at desc)';
  end if;

  if to_regclass('public.mensagens') is not null then
    execute 'create index if not exists idx_mensagens_carteira_created on public.mensagens(carteira_id, created_at desc)';
    execute 'create index if not exists idx_mensagens_lote_status on public.mensagens(lote_id, status)';
    execute 'create index if not exists idx_mensagens_lote_status_operacional on public.mensagens(lote_id, status_operacional)';
    execute 'create index if not exists idx_mensagens_status_created on public.mensagens(status, created_at desc)';
    execute 'create index if not exists idx_mensagens_status_operacional_created on public.mensagens(status_operacional, created_at desc)';
  end if;

  if to_regclass('public.lotes') is not null then
    execute 'create index if not exists idx_lotes_carteira_tipo_created on public.lotes(carteira_id, tipo, created_at desc)';
    execute 'create index if not exists idx_lotes_tipo_created on public.lotes(tipo, created_at desc)';
  end if;

  if to_regclass('public.lote_itens') is not null then
    execute 'create index if not exists idx_lote_itens_lote_status on public.lote_itens(lote_id, status)';
    execute 'create index if not exists idx_lote_itens_mensagem_id on public.lote_itens(mensagem_id)';
  end if;
end $$;
