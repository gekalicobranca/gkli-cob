do $$
begin
  if to_regclass('public.unidades') is not null then
    execute 'create index if not exists idx_unidades_carteira_status_condominio on public.unidades(carteira_id, status, condominio_id)';
    execute 'create index if not exists idx_unidades_carteira_condominio_identificacao on public.unidades(carteira_id, condominio_id, identificacao)';
    execute 'create index if not exists idx_unidades_carteira_responsavel_nome on public.unidades(carteira_id, responsavel_nome)';
  end if;
end $$;
