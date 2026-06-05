-- Comparacao somente leitura entre a fonte canonica e a tabela legada.
-- Use este arquivo apenas quando `to_regclass('public.acordos_parcelas')`
-- retornar `acordos_parcelas`.

-- 1) Schema lado a lado.
select
  table_name,
  column_name,
  data_type,
  is_nullable,
  column_default
from information_schema.columns
where table_schema = 'public'
  and table_name in ('parcelas_acordo', 'acordos_parcelas')
order by table_name, ordinal_position;

-- 2) Volume geral.
select
  'parcelas_acordo' as tabela,
  count(*) as total,
  count(distinct acordo_id) as acordos_com_parcelas
from public.parcelas_acordo
union all
select
  'acordos_parcelas' as tabela,
  count(*) as total,
  count(distinct acordo_id) as acordos_com_parcelas
from public.acordos_parcelas;

-- 3) Distribuicao por status.
select
  'parcelas_acordo' as tabela,
  status,
  count(*) as total
from public.parcelas_acordo
group by status
union all
select
  'acordos_parcelas' as tabela,
  status,
  count(*) as total
from public.acordos_parcelas
group by status
order by tabela, total desc, status nulls first;

-- 4) Acordos que existem no legado e nao existem na fonte canonica.
select
  legado.acordo_id,
  legado.total_parcelas_legado,
  legado.valor_total_legado
from (
  select
    acordo_id,
    count(*) as total_parcelas_legado,
    sum(coalesce(valor, 0)) as valor_total_legado
  from public.acordos_parcelas
  group by acordo_id
) legado
left join (
  select acordo_id
  from public.parcelas_acordo
  group by acordo_id
) canonico on canonico.acordo_id = legado.acordo_id
where canonico.acordo_id is null
order by legado.valor_total_legado desc nulls last, legado.acordo_id
limit 100;

-- 5) Acordos que existem na fonte canonica e nao existem no legado.
select
  canonico.acordo_id,
  canonico.total_parcelas_canonico,
  canonico.valor_total_canonico
from (
  select
    acordo_id,
    count(*) as total_parcelas_canonico,
    sum(coalesce(valor, 0)) as valor_total_canonico
  from public.parcelas_acordo
  group by acordo_id
) canonico
left join (
  select acordo_id
  from public.acordos_parcelas
  group by acordo_id
) legado on legado.acordo_id = canonico.acordo_id
where legado.acordo_id is null
order by canonico.valor_total_canonico desc nulls last, canonico.acordo_id
limit 100;

-- 6) Acordos presentes nas duas fontes, mas com contagem/valor divergente.
with canonico as (
  select
    acordo_id,
    count(*) as total_parcelas_canonico,
    sum(coalesce(valor, 0)) as valor_total_canonico
  from public.parcelas_acordo
  group by acordo_id
),
legado as (
  select
    acordo_id,
    count(*) as total_parcelas_legado,
    sum(coalesce(valor, 0)) as valor_total_legado
  from public.acordos_parcelas
  group by acordo_id
)
select
  coalesce(canonico.acordo_id, legado.acordo_id) as acordo_id,
  canonico.total_parcelas_canonico,
  legado.total_parcelas_legado,
  canonico.valor_total_canonico,
  legado.valor_total_legado,
  coalesce(canonico.valor_total_canonico, 0) - coalesce(legado.valor_total_legado, 0) as diferenca_valor
from canonico
join legado on legado.acordo_id = canonico.acordo_id
where canonico.total_parcelas_canonico is distinct from legado.total_parcelas_legado
   or canonico.valor_total_canonico is distinct from legado.valor_total_legado
order by abs(coalesce(canonico.valor_total_canonico, 0) - coalesce(legado.valor_total_legado, 0)) desc,
         acordo_id
limit 100;

-- 7) Parcelas canonicas fora do status interno esperado pelo app.
select
  status,
  count(*) as total
from public.parcelas_acordo
where coalesce(status, '') not in ('aberta', 'paga', 'vencida', 'cancelada')
group by status
order by total desc, status nulls first;
