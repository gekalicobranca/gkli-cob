do $$
begin
  if to_regclass('public.central_pendencias') is not null then
    execute 'create index if not exists idx_central_pendencias_carteira_status on public.central_pendencias(carteira_id, status)';
    execute 'create index if not exists idx_central_pendencias_filtros on public.central_pendencias(status, prioridade, origem, tipo)';
    execute 'create index if not exists idx_central_pendencias_prazo on public.central_pendencias(prazo_limite) where status not in (''resolvida'', ''cancelada'')';
    execute 'create index if not exists idx_central_pendencias_created_at on public.central_pendencias(created_at desc)';
  end if;
end $$;
