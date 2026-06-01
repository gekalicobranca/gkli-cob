-- Compatibilidade entre o código atual do módulo Condomínios/Acordos
-- e a migration 2026-05-28_condominios_regras_acordos.sql.
--
-- O app usa os nomes abaixo:
--   parcelas_acordo_sem_aprovacao_sindico
--   dias_reemissao_parcela_acordo_atrasada
--
-- Esta migration é idempotente e pode ser executada sem perda de dados.

alter table public.condominios
  add column if not exists parcelas_acordo_sem_aprovacao_sindico integer not null default 0,
  add column if not exists dias_reemissao_parcela_acordo_atrasada integer not null default 0;

-- Migra valores de nomes usados em versões intermediárias, quando existirem.
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'condominios'
      and column_name = 'parcelas_permitidas_sem_aprovacao_sindico'
  ) then
    execute '
      update public.condominios
         set parcelas_acordo_sem_aprovacao_sindico = coalesce(parcelas_acordo_sem_aprovacao_sindico, parcelas_permitidas_sem_aprovacao_sindico, 0)
       where parcelas_acordo_sem_aprovacao_sindico = 0
         and parcelas_permitidas_sem_aprovacao_sindico is not null
    ';
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'condominios'
      and column_name = 'dias_reemissao_parcela_acordo_atraso'
  ) then
    execute '
      update public.condominios
         set dias_reemissao_parcela_acordo_atrasada = coalesce(dias_reemissao_parcela_acordo_atrasada, dias_reemissao_parcela_acordo_atraso, 0)
       where dias_reemissao_parcela_acordo_atrasada = 0
         and dias_reemissao_parcela_acordo_atraso is not null
    ';
  end if;
end $$;

alter table public.condominios
  drop constraint if exists condominios_parcelas_acordo_sem_aprovacao_sindico_chk,
  add constraint condominios_parcelas_acordo_sem_aprovacao_sindico_chk
    check (parcelas_acordo_sem_aprovacao_sindico >= 0 and parcelas_acordo_sem_aprovacao_sindico <= 120),
  drop constraint if exists condominios_dias_reemissao_parcela_acordo_atrasada_chk,
  add constraint condominios_dias_reemissao_parcela_acordo_atrasada_chk
    check (dias_reemissao_parcela_acordo_atrasada >= 0 and dias_reemissao_parcela_acordo_atrasada <= 365);

comment on column public.condominios.parcelas_acordo_sem_aprovacao_sindico is
  'Quantidade de parcelas que pode ser feita sem aprovação do síndico. 0 = sempre exige aprovação conforme decisão operacional.';

comment on column public.condominios.dias_reemissao_parcela_acordo_atrasada is
  'Dias após vencimento em que a reemissão de parcela de acordo atrasada é permitida. 0 = não permite.';
