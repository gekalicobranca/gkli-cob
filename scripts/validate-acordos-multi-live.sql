-- Integração com os gatilhos e RLS reais; todos os registros são revertidos.
begin;
do $$
declare
  carteira uuid := '06827218-e2b1-4267-ad8f-81a0ab222cad';
  condominio uuid := gen_random_uuid(); ua uuid := gen_random_uuid(); ub uuid := gen_random_uuid();
  ca uuid := gen_random_uuid(); cb uuid := gen_random_uuid(); acordo uuid; usuario uuid; msg text;
  itens jsonb;
begin
  select id into strict usuario from public.profiles where role='admin' order by id limit 1;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',usuario,'role','authenticated')::text,true);
  insert into public.condominios(id,carteira_id,nome) values(condominio,carteira,'VALIDACAO REVERTIDA MULTI UNIDADES');
  insert into public.unidades(id,carteira_id,condominio_id,identificacao,bloco)
    values(ua,carteira,condominio,'001','A'),(ub,carteira,condominio,'002','B');
  insert into public.cobrancas(id,carteira_id,condominio_id,unidade_id,vencimento,valor_original,valor_atualizado)
    values(ca,carteira,condominio,ua,current_date,50,50),(cb,carteira,condominio,ub,current_date,50,50);
  itens:=jsonb_build_array(jsonb_build_object('cobranca_id',ca,'valor_original_no_acordo',50,'valor_total_no_acordo',55),
    jsonb_build_object('cobranca_id',cb,'valor_original_no_acordo',50,'valor_total_no_acordo',55));
  execute 'set local role authenticated';
  acordo:=public.criar_acordo_financeiro(carteira,cb,condominio,ub,'extrajudicial',null,110,0,10,10,current_date,
    'ativo','boletos_solicitados',false,null,'VALIDACAO REVERTIDA',itens,
    jsonb_build_array(jsonb_build_object('numero',1,'valor',55,'vencimento',current_date),
    jsonb_build_object('numero',2,'valor',55,'vencimento',current_date+30)),'em_negociacao');
  if not exists(select 1 from public.acordos where id=acordo and unidade_id=ub and cobranca_id=cb) then
    raise exception 'Titular não foi preservada';
  end if;
  if (select count(distinct c.unidade_id) from public.acordo_cobrancas ac join public.cobrancas c on c.id=ac.cobranca_id where ac.acordo_id=acordo)<>2 then
    raise exception 'Origens das cobranças não foram preservadas';
  end if;
  begin
    perform public.criar_acordo_financeiro(carteira,ca,condominio,ua,'extrajudicial',null,55,0,10,5,current_date,
      'ativo','boletos_solicitados',false,null,null,jsonb_build_array(jsonb_build_object('cobranca_id',ca)),
      jsonb_build_array(jsonb_build_object('numero',1,'valor',55,'vencimento',current_date)),'em_negociacao');
    raise exception 'Duplicidade indevidamente permitida';
  exception when unique_violation then
    get stacked diagnostics msg=message_text;
    if position(acordo::text in msg)=0 then raise exception 'Bloqueio não identificou o acordo existente'; end if;
  end;
  if (select count(*) from public.acordos where condominio_id=condominio)<>1
    or (select count(*) from public.parcelas_acordo where acordo_id=acordo)<>2
    or (select sum(valor) from public.parcelas_acordo where acordo_id=acordo)<>110
    or exists(select 1 from public.mensagens where acordo_id=acordo) then
    raise exception 'Contagem, valor ou ausência de mensagens divergente';
  end if;
end $$;
rollback;
select 'OK: titular B, duas unidades, um acordo, duas parcelas, bloqueio de repetição e RLS autenticada. Registros revertidos.' resultado;
