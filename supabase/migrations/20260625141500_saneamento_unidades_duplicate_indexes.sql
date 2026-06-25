-- Read-path indexes for unit duplicate diagnostics in saneamento.

do $$
begin
  if to_regclass('public.unidades') is not null then
    execute 'create index if not exists idx_unidades_condominio_bloco_identificacao on public.unidades(condominio_id, bloco, identificacao)';
  end if;

  if to_regclass('public.cobrancas') is not null then
    execute 'create index if not exists idx_cobrancas_unidade_id on public.cobrancas(unidade_id)';
  end if;

  if to_regclass('public.acordos') is not null then
    execute 'create index if not exists idx_acordos_unidade_id on public.acordos(unidade_id)';
  end if;
end $$;
