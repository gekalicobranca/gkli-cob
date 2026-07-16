alter table public.condominios
  add column if not exists dias_expiracao_regua_pre_juridico integer;

alter table public.condominios
  drop constraint if exists condominios_dias_expiracao_regua_pre_juridico_chk,
  add constraint condominios_dias_expiracao_regua_pre_juridico_chk
    check (
      dias_expiracao_regua_pre_juridico is null
      or dias_expiracao_regua_pre_juridico >= 0
    );

comment on column public.condominios.dias_expiracao_regua_pre_juridico is
  'Quantidade de dias apos o inicio da regua de cobranca para mover automaticamente a cobranca ativa para pre-juridico. Null desativa.';
