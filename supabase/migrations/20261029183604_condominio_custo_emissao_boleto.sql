alter table public.condominios
  add column if not exists custo_emissao_boleto numeric(14,2) not null default 0
  check (custo_emissao_boleto >= 0);

comment on column public.condominios.custo_emissao_boleto is
  'Custo de emissão de boleto em reais. Zero não acrescenta custo a novos acordos.';
