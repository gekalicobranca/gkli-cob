-- Verificação transacional: não deixa mensagens, lotes ou Flows de teste.
begin;
set local role service_role;
do $$
declare
  carteira uuid;
  regua uuid;
  lote uuid;
  mensagem uuid;
  flow uuid;
  qtd integer;
begin
  select r.id, r.carteira_id into strict regua, carteira
  from public.reguas r where r.tipo = 'cobranca' and r.carteira_id is not null limit 1;
  insert into public.lotes(carteira_id, tipo, status)
  values(carteira, 'regua_cobranca', 'processando') returning id into lote;

  foreach qtd in array array[0, 1] loop
    begin
      insert into public.cobranca_flows(carteira_id, lote_id, regua_id, nome, total_mensagens)
      values(carteira, lote, regua, 'Teste transacional: Flow vazio', qtd);
      raise exception 'Falha: criação vazia foi permitida';
    exception when check_violation then
      if sqlerrm not like 'Nenhuma mensagem válida no lote.%' then raise; end if;
    end;
  end loop;

  insert into public.mensagens(carteira_id, lote_id, contexto, canal, status, status_operacional)
  values(carteira, lote, 'regua_cobranca', 'email', 'cancelada', 'cancelada') returning id into mensagem;
  begin
    insert into public.cobranca_flows(carteira_id, lote_id, regua_id, nome, total_mensagens)
    values(carteira, lote, regua, 'Teste transacional: mensagem cancelada', 1);
    raise exception 'Falha: apenas mensagem cancelada foi aceita';
  exception when check_violation then
    if sqlerrm not like 'Nenhuma mensagem válida no lote.%' then raise; end if;
  end;

  update public.mensagens set status = 'pendente_aprovacao', status_operacional = 'pendente_aprovacao' where id = mensagem;
  insert into public.cobranca_flows(carteira_id, lote_id, regua_id, nome, total_mensagens, status)
  values(carteira, lote, regua, 'Teste transacional: Flow válido', 1, 'pausado') returning id into flow;
  if flow is null then raise exception 'Falha: Flow válido não foi criado'; end if;
  -- A guarda só impede a criação; cancelamentos posteriores continuam permitidos.
  update public.cobranca_flows set total_mensagens = 0, status = 'cancelado' where id = flow;
end;
$$;
rollback;
select 'Criações vazias recusadas; criação válida preservada; testes revertidos.' as verificacao;
