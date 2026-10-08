begin;
-- Mantém timeout, escopo, auditoria e proteção dos acordos da função atual.
do $$ declare definition text; begin
select pg_get_functiondef('public.importacao_substituir_cobrancas_anteriores(uuid)'::regprocedure) into definition;
if position('in (''novo'',''em_cobranca_ativa'')' in definition)=0 then raise exception 'Regra de substituição inesperada; migração não aplicada.'; end if;
definition:=replace(definition,'in (''novo'',''em_cobranca_ativa'')','in (''regular'',''novo'',''em_cobranca_ativa'')');
definition:=replace(definition,'Substituição de cobranças Novo/Cobrança ativa sem acordo','Substituição de cobranças Regular/Novo/Cobrança ativa sem acordo');
execute definition;
end $$;
notify pgrst,'reload schema';
commit;
