-- SMTP credentials and flow mutations are accessed by authorized server code.
-- Browser sessions must use those server actions, not the underlying tables.
begin;
set local lock_timeout = '5s';

do $$
declare tabela text;
begin
  foreach tabela in array array[
    'integracoes_smtp_config', 'acordo_flows',
    'pre_juridico_flows', 'cobranca_flows'
  ] loop
    execute format('alter table public.%I enable row level security', tabela);
    execute format('revoke all privileges on table public.%I from public, anon, authenticated', tabela);
    execute format('grant select, insert, update, delete on table public.%I to service_role', tabela);
    -- Explicit backend policy documents the intended access. The existing
    -- service_role also bypasses RLS; no new elevated role is introduced.
    execute format('create policy backend_service_role on public.%I for all to service_role using (true) with check (true)', tabela);
  end loop;
end $$;

notify pgrst, 'reload schema';
commit;
