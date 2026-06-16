-- Diagnostico somente leitura: fonte de verdade de auditoria, status e parcelas.
-- Execute no Supabase SQL Editor antes de aplicar constraints novas.

-- 1) Schema atual das tabelas de auditoria/timeline.
select
  table_name,
  column_name,
  data_type,
  is_nullable,
  column_default
from information_schema.columns
where table_schema = 'public'
  and table_name in (
    'timeline_operacional',
    'auditoria_eventos',
    'eventos_operacionais',
    'audit_logs',
    'auditoria_operacional'
  )
order by table_name, ordinal_position;

-- 2) Presenca e estimativa de registros por tabela de auditoria/timeline.
-- Usa catalogo para nao falhar quando uma tabela legada nao existir.
select
  wanted.table_name,
  coalesce(stats.n_live_tup, 0) as linhas_estimadas,
  to_regclass(format('public.%I', wanted.table_name)) is not null as existe
from (
  values
    ('timeline_operacional'),
    ('auditoria_eventos'),
    ('eventos_operacionais'),
    ('audit_logs'),
    ('auditoria_operacional')
) as wanted(table_name)
left join pg_stat_user_tables stats
  on stats.schemaname = 'public'
 and stats.relname = wanted.table_name
order by wanted.table_name;

-- 3) Status de cobranca fora do conjunto canonico.
select
  status_operacional,
  status,
  status_financeiro,
  count(*) as total
from public.cobrancas
where coalesce(status_operacional, '') not in (
    'novo',
    'em_cobranca_ativa',
    'em_negociacao',
    'acordo_firmado',
    'acordo_efetivado',
    'pre_juridico',
    'judicializado',
    'suspenso'
  )
  or coalesce(status_financeiro, '') not in (
    'em_aberto',
    'parcial',
    'quitado',
    'vencido',
    'renegociado'
  )
group by status_operacional, status, status_financeiro
order by total desc, status_operacional nulls first;

-- 4) Divergencia entre status legado e status_operacional.
select
  status,
  status_operacional,
  count(*) as total
from public.cobrancas
where status is distinct from status_operacional
group by status, status_operacional
order by total desc, status nulls first;

-- 5) Status de acordo fora do conjunto canonico.
select
  status,
  status_financeiro,
  fluxo_status,
  count(*) as total
from public.acordos
where coalesce(status, '') not in (
    'ativo',
    'em_dia',
    'em_atraso',
    'vencido',
    'quebrado',
    'rompido',
    'quitado',
    'cancelado',
    'renegociado'
  )
  or coalesce(status_financeiro, '') not in (
    'em_aberto',
    'parcial',
    'quitado',
    'vencido',
    'cancelado'
  )
group by status, status_financeiro, fluxo_status
order by total desc, status nulls first;

-- 6) Fonte canonica de parcelas de acordo.
select
  'parcelas_acordo' as tabela,
  count(*) as total,
  count(distinct acordo_id) as acordos_com_parcelas
from public.parcelas_acordo;

-- 7) Presenca da tabela legada, sem depender que ela exista.
select
  to_regclass('public.acordos_parcelas') as tabela_legada_acordos_parcelas;

-- Como a tabela legada existe no banco live, rode tambem o arquivo:
-- supabase/sql/2026-06-05_comparar_parcelas_acordo_legado.sql

-- 8) Parcelas de acordo fora do conjunto canonico.
select
  status,
  count(*) as total
from public.parcelas_acordo
where coalesce(status, '') not in (
    'aberta',
    'paga',
    'vencida',
    'cancelada'
  )
group by status
order by total desc, status nulls first;
