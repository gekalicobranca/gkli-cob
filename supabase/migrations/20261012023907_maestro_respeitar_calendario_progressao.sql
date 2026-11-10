-- O cron da progressao executa somente de segunda a sexta em Sao Paulo.
-- A montagem nao pode ceder a vez a uma rotina suspensa pelo calendario.
begin;
do $$
declare definicao text;
begin
 select pg_get_functiondef('public.maestro_flow_tick()'::regprocedure) into definicao;
 if position('and flows_job_tem_trabalho(''progredir'')' in definicao)=0 then
   raise exception 'Definicao inesperada de maestro_flow_tick';
 end if;
 execute replace(definicao,
   'and flows_job_tem_trabalho(''progredir'')',
   'and extract(isodow from timezone(''America/Sao_Paulo'', now())) between 1 and 5
 and flows_job_tem_trabalho(''progredir'')');
end $$;
commit;

