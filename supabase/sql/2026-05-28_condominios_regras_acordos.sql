-- Regras operacionais de acordos por condomínio
-- Campos usados na simulação/criação de acordos e no acompanhamento das parcelas.

alter table public.condominios
  add column if not exists parcelas_permitidas_sem_aprovacao_sindico integer not null default 3,
  add column if not exists dias_reemissao_parcela_acordo_atraso integer not null default 0;

alter table public.condominios
  drop constraint if exists condominios_parcelas_permitidas_sem_aprovacao_sindico_check,
  add constraint condominios_parcelas_permitidas_sem_aprovacao_sindico_check
    check (parcelas_permitidas_sem_aprovacao_sindico >= 0 and parcelas_permitidas_sem_aprovacao_sindico <= 60);

alter table public.condominios
  drop constraint if exists condominios_dias_reemissao_parcela_acordo_atraso_check,
  add constraint condominios_dias_reemissao_parcela_acordo_atraso_check
    check (dias_reemissao_parcela_acordo_atraso >= 0 and dias_reemissao_parcela_acordo_atraso <= 365);

comment on column public.condominios.parcelas_permitidas_sem_aprovacao_sindico is
  'Quantidade máxima de parcelas em acordo permitida sem aprovação do síndico. Acima desse limite, a simulação deve gerar pendência/e-mail de aprovação.';

comment on column public.condominios.dias_reemissao_parcela_acordo_atraso is
  'Quantidade de dias após o vencimento em que uma parcela de acordo em atraso pode ser reemitida. Zero bloqueia reemissão.';
