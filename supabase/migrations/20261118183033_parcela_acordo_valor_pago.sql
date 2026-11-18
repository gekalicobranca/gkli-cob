alter table public.parcelas_acordo
  add column if not exists valor_pago numeric(14, 2)
  check (valor_pago is null or valor_pago >= 0);

comment on column public.parcelas_acordo.valor_pago is
  'Valor efetivamente recebido na parcela; valor permanece como montante previsto no acordo/PDF.';
