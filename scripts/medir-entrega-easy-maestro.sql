-- Somente leitura. Compare janelas de pedidos anteriores e posteriores à publicação.
with janela as (
  select now() - interval '72 hours' as inicio, now() as fim
),
pedidos as (
  select e.id, e.created_at as solicitado_em, e.status as status_coleta
  from public.agente_execucoes e
  cross join janela j
  where e.easy_maestro_lote_id is not null and e.easy_maestro_montar_flow
    and e.created_at >= j.inicio and e.created_at < j.fim
),
entregas as (
  select p.*, m.status as status_montagem, m.created_at as enfileirado_em,
    f.primeiro, f.ultimo, f.total
  from pedidos p
  left join public.maestro_flow_montagens m on m.execucao_id = p.id
  left join lateral (
    select min(f.created_at) as primeiro, max(f.created_at) as ultimo, count(*) as total
    from public.cobranca_flows f
    where f.id = any(m.flow_ids) and f.total_mensagens > 0
  ) f on true
),
tempos as (
  select faixa, etapa, extract(epoch from duracao) as segundos
  from entregas
  cross join lateral (values (
    case when total = 1 then '1 flow entregue' else '2 ou mais flows entregues' end
  )) grupos(faixa)
  cross join lateral (values
    ('solicitação até primeiro flow', primeiro - solicitado_em),
    ('solicitação até último flow', ultimo - solicitado_em),
    ('fila de montagem até primeiro flow', primeiro - enfileirado_em),
    ('fila de montagem até último flow', ultimo - enfileirado_em)
  ) etapas(etapa, duracao)
  where status_montagem = 'concluido' and total > 0
)
select
  (select count(*) from pedidos) as solicitacoes,
  (select count(distinct id) from entregas where status_montagem = 'concluido' and total > 0) as solicitacoes_entregues,
  (select count(distinct id) from entregas where status_montagem = 'concluido' and total = 0) as concluidas_sem_flow_com_mensagens,
  faixa, etapa, count(*) as amostra,
  round(percentile_cont(0.5) within group (order by segundos)::numeric) as mediana_segundos,
  round(percentile_cont(0.9) within group (order by segundos)::numeric) as p90_segundos
from tempos
group by grouping sets ((faixa, etapa), (etapa))
order by faixa nulls first, etapa;
