-- Apoio temporario de implantacao: acompanhamento de acionamentos manuais.

alter table if exists public.mensagens
  add column if not exists enviada_manual boolean not null default false,
  add column if not exists enviada_manual_em timestamptz,
  add column if not exists enviada_manual_por uuid,
  add column if not exists ultima_tentativa_em timestamptz;
