-- Keep grants, policy roles/commands, and every access predicate unchanged.
-- Only auth.uid() becomes an uncorrelated scalar subquery (statement InitPlan).
begin;
set local lock_timeout = '1s';
set local statement_timeout = '30s';

-- Small, selective FK lookups used by imports, worker queues and execution logs.
lock table public.cobrancas, public.saneamento_cobrancas,
  public.agente_logs, public.agente_execucoes in share mode nowait;
create index idx_cobrancas_duplicada_de_id on public.cobrancas(duplicada_de_id);
create index idx_saneamento_cobrancas_cobranca_id on public.saneamento_cobrancas(cobranca_id);
create index idx_agente_logs_execucao_id on public.agente_logs(execucao_id);
create index idx_agente_execucoes_receita_id on public.agente_execucoes(receita_id);

do $$
declare target record; p record; clauses text;
begin
  for target in select * from (values
    ('agente_acordos_execucoes', 'acordos_exec_solicitar'),
    ('fechamento_auditoria', 'fechamento_auditoria_gestores_all'),
    ('fechamento_carteiras', 'fechamento_carteiras_gestores_all'),
    ('fechamento_comissoes', 'fechamento_comissoes_gestores_all'),
    ('fechamento_despesas', 'fechamento_despesas_gestores_all'),
    ('fechamento_faturamentos_omie', 'fechamento_faturamentos_gestores_all'),
    ('fechamento_operadores', 'fechamento_operadores_gestores_all'),
    ('fechamento_pagamentos', 'fechamento_pagamentos_gestores_all'),
    ('fechamento_periodos', 'fechamento_gestores_all')
  ) as policies(table_name,policy_name) loop
    execute format('lock table public.%I in access exclusive mode nowait', target.table_name);
    select * into strict p from pg_policies
      where schemaname='public' and tablename=target.table_name and policyname=target.policy_name;
    clauses := '';
    if p.qual is not null then
      clauses := clauses || format(' using (%s)',replace(p.qual,'auth.uid()','(select auth.uid())'));
    end if;
    if p.with_check is not null then
      clauses := clauses || format(' with check (%s)',replace(p.with_check,'auth.uid()','(select auth.uid())'));
    end if;
    if strpos(coalesce(p.qual,'')||coalesce(p.with_check,''),'auth.uid()')=0 then
      raise exception 'Expected auth.uid() in policy %',target.policy_name;
    end if;
    -- ALTER changes only the two expressions, preserving roles and command.
    execute format('alter policy %I on public.%I%s',target.policy_name,target.table_name,clauses);
  end loop;
end $$;
notify pgrst, 'reload schema';
commit;
