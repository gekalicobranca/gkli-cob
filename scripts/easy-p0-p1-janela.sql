-- Conferência da janela. Somente agregados no mesmo snapshot.
begin isolation level repeatable read read only;
set local statement_timeout = '30s';
set local lock_timeout = '2s';
with ativos as (
  select count(*) n from public.easy_flow_execucoes
  where status in ('preview','montando','entre_partes','pronto','liberando','atencao')
  group by condominio_id
)
select now() as observado_em,
  (select count(*) from ativos where n > 1) as condominios_conflitantes,
  (select coalesce(sum(n),0) from ativos) as flows_legados_abertos,
  (select count(*) from public.agente_execucoes where easy_maestro_lote_id is not null and status='pendente') as pedidos_pendentes,
  (select count(*) from public.agente_execucoes where easy_maestro_lote_id is not null and status='em_execucao') as em_execucao,
  (select count(*) from public.maestro_flow_montagens m join public.agente_execucoes e on e.id=m.execucao_id
   where e.easy_maestro_lote_id is not null and m.status in ('pendente','processando')) as montagens_abertas,
  (select count(*) from public.maestro_flow_ativacoes a join public.cobranca_flows f on f.id=a.flow_id
   where f.payload->>'origem'='easy_maestro' and a.status='pendente') as ativacoes_pendentes;
select count(*) as pares_flow_duplicados from (
  select 1 from public.cobranca_flows where payload ? 'easy_execucao_id'
    and payload->>'easy_execucao_id' is not null and payload->>'easy_indice' is not null
  group by payload->>'easy_execucao_id',payload->>'easy_indice' having count(*)>1
) duplicados;
select count(*) as pares_item_duplicados from (
  select 1 from public.lote_itens where payload ? 'easy_execucao_id'
    and payload->>'easy_execucao_id' is not null and cobranca_id is not null
  group by payload->>'easy_execucao_id',cobranca_id having count(*)>1
) duplicados;
select count(*) as cobrancas, max(octet_length(public.cobranca_recibo_identidade(observacoes))) as maior_identidade_bytes
from public.cobrancas;
select version,name from supabase_migrations.schema_migrations order by version;
rollback;
