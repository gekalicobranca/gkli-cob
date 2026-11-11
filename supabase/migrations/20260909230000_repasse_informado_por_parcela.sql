-- Preserve explicit installment fees, including zero; NULL retains proportional calculation.
alter table public.parcelas_acordo
  add column if not exists valor_repasse_informado numeric(14,2)
  check (valor_repasse_informado >= 0);

comment on column public.parcelas_acordo.valor_repasse_informado is
  'Repasse exato informado para a parcela. NULL usa o rateio do acordo; zero é um repasse explicitamente isento.';

-- Modify only the fee calculation in the installed function, preserving all other logic.
do $migration$
declare
  definition text;
  old_calculation text := $old$case
      when coalesce(a.despesa_cobranca_valor, 0) > 0 and coalesce(a.valor_acordado, 0) > 0
        then round(a.despesa_cobranca_valor * a.valor_recebido / a.valor_acordado, 2)
      else round(a.valor_recebido * coalesce(a.despesa_cobranca_percentual, 0) / 100, 2)
    end$old$;
begin
  select pg_get_functiondef('public.apurar_fechamento_mensal(uuid)'::regprocedure) into definition;
  if position('coalesce(a.valor_repasse_informado,' in definition) > 0 then
    return;
  end if;
  if position('p.id as parcela_paga_id,' in definition) = 0
     or position(old_calculation in definition) = 0 then
    raise exception 'A função de fechamento mudou. Revisar a migração de repasse antes de aplicar.';
  end if;
  definition := replace(definition, 'p.id as parcela_paga_id,',
    'p.id as parcela_paga_id, p.valor_repasse_informado,');
  definition := replace(definition, old_calculation,
    'coalesce(a.valor_repasse_informado, ' || old_calculation || ')');
  execute definition;
end;
$migration$;

notify pgrst, 'reload schema';
