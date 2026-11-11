-- A substituicao do Maestro so deve remover cobrancas ainda em aberto.
-- Recibos quitados ausentes do relatorio precisam permanecer no historico.
do $$
declare
  definicao text;
  trecho_antigo text := 'and c.duplicada_de_id is null and c.status_operacional in (''regular'',''novo'',''em_cobranca_ativa'')';
  trecho_novo text := 'and c.duplicada_de_id is null and c.status_financeiro <> ''quitado'' and c.status_operacional in (''regular'',''novo'',''em_cobranca_ativa'')';
begin
  select pg_get_functiondef(p.oid) into strict definicao
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='maestro_substituir_cobrancas_conversao'
    and pg_get_function_identity_arguments(p.oid)='p_conversao uuid';

  if position(trecho_novo in definicao)>0 then return; end if;
  if position(trecho_antigo in definicao)=0 then
    raise exception 'A selecao de cobrancas do Maestro mudou; revise a funcao antes de migrar.';
  end if;
  execute replace(definicao,trecho_antigo,trecho_novo);
end $$;
