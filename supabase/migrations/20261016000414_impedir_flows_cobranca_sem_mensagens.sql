begin;

-- A proteção vale para criação manual, Maestro e continuação de régua.
-- As mensagens são preparadas no lote antes da criação e vinculadas em seguida.
create or replace function public.flow_cobranca_exigir_mensagens()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if coalesce(new.total_mensagens, 0) <= 0 or not exists (
    select 1 from public.mensagens m
    where m.lote_id = new.lote_id
      and m.carteira_id = new.carteira_id
      and m.status not in ('cancelada', 'cancelado')
      and (m.cobranca_flow_id is null or m.cobranca_flow_id = new.id)
  ) then
    raise exception 'Nenhuma mensagem válida no lote. O Flow não foi criado; revise as pendências da cobrança.'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

revoke all on function public.flow_cobranca_exigir_mensagens() from public, anon, authenticated;
grant execute on function public.flow_cobranca_exigir_mensagens() to service_role;

drop trigger if exists flow_cobranca_impedir_vazio on public.cobranca_flows;
create trigger flow_cobranca_impedir_vazio
before insert on public.cobranca_flows
for each row execute function public.flow_cobranca_exigir_mensagens();

commit;
