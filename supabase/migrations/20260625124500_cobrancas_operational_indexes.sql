do $$
begin
  if to_regclass('public.cobrancas') is not null then
    execute 'create index if not exists idx_cobrancas_carteira_status_operacional_vencimento on public.cobrancas(carteira_id, status_operacional, vencimento)';
    execute 'create index if not exists idx_cobrancas_carteira_status_vencimento on public.cobrancas(carteira_id, status, vencimento)';
    execute 'create index if not exists idx_cobrancas_carteira_condominio_vencimento on public.cobrancas(carteira_id, condominio_id, vencimento)';
    execute 'create index if not exists idx_cobrancas_carteira_unidade_vencimento on public.cobrancas(carteira_id, unidade_id, vencimento)';
    execute 'create index if not exists idx_cobrancas_carteira_valor_vencimento on public.cobrancas(carteira_id, valor_atualizado, vencimento)';
  end if;
end $$;
