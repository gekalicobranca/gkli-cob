begin;

create function public.propagar_acordo_quitado_cobrancas()
returns trigger
language plpgsql security invoker set search_path = '' as $$
declare
  acordo_id uuid;
  cobranca_vinculada uuid;
  acordo public.acordos%rowtype;
begin
  if tg_table_name = 'acordos' then
    acordo := new;
  else
    acordo_id := new.acordo_id;
    cobranca_vinculada := new.cobranca_id;
    -- Alguns importadores criam os vínculos depois de gravar o acordo.
    -- A trava serializa esse vínculo com uma quitação concorrente.
    select a.* into acordo
    from public.acordos a
    where a.id = acordo_id
    for share;
  end if;

  if acordo.status is distinct from 'quitado' then
    return new;
  end if;

  with vinculadas as (
    select cobranca_vinculada as id where cobranca_vinculada is not null
    union
    select acordo.cobranca_id where cobranca_vinculada is null
    union
    select ac.cobranca_id
    from public.acordo_cobrancas ac
    where ac.acordo_id = acordo.id and cobranca_vinculada is null
  )
  update public.cobrancas c
  -- As parcelas do acordo são o registro do pagamento. Aqui encerramos o saldo de origem.
  set status_financeiro = 'quitado'
  from vinculadas v
  where c.id = v.id
    and c.carteira_id = acordo.carteira_id
    and c.condominio_id = acordo.condominio_id
    and c.duplicada_de_id is null
    and c.arquivada_em is null
    and coalesce(c.status_financeiro, 'em_aberto') in ('em_aberto', 'vencido', 'parcial', 'renegociado');

  return new;
end;
$$;

revoke all on function public.propagar_acordo_quitado_cobrancas() from public, anon, authenticated;

create trigger propagar_acordo_quitado_cobrancas
after insert or update of status, cobranca_id on public.acordos
for each row when (new.status = 'quitado')
execute function public.propagar_acordo_quitado_cobrancas();

create trigger propagar_vinculo_acordo_quitado
after insert or update of acordo_id, cobranca_id on public.acordo_cobrancas
for each row execute function public.propagar_acordo_quitado_cobrancas();

commit;
