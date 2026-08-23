alter table public.condominios
  add column if not exists dias_cobranca_ativa integer not null default 60,
  add column if not exists pre_juridico_habilitado boolean not null default false;

update public.condominios
set
  dias_cobranca_ativa = coalesce(dias_expiracao_regua_pre_juridico, 60),
  pre_juridico_habilitado = dias_expiracao_regua_pre_juridico is not null;

alter table public.condominios
  add constraint condominios_dias_cobranca_ativa_chk
  check (dias_cobranca_ativa between 0 and 3650);

comment on column public.condominios.dias_cobranca_ativa is
  'Quantidade de dias em que a cobranca permanece ativa e disponivel para acordos apos o inicio da regua.';

comment on column public.condominios.pre_juridico_habilitado is
  'Quando verdadeiro, cobrancas sem acordo sao movidas ao pre-juridico ao fim do prazo de cobranca ativa.';
