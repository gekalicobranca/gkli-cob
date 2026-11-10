begin;

-- Uma chamada conserva os IDs das parcelas existentes, guarda o documento e
-- registra a revisão. Falhas de conferência ou concorrência revertem tudo.
create function public.acordo_aplicar_parcelas_pdf_adm(
  p_acordo uuid, p_revisao text, p_referencia text, p_nome_pdf text,
  p_pdf_base64 text, p_parcelas jsonb
) returns void language plpgsql security invoker set search_path = '' as $$
declare
  a public.acordos%rowtype;
  antiga public.parcelas_acordo%rowtype;
  item record;
  v_pdf bytea;
  v_total numeric;
  v_entrada numeric;
  v_quantidade integer;
  v_limite integer;
  v_antes jsonb;
  v_agora jsonb;
  v_igual boolean;
  v_hoje date := (clock_timestamp() at time zone 'America/Sao_Paulo')::date;
begin
  select * into a from public.acordos where id = p_acordo for update;
  if not found or auth.uid() is null or public.current_user_can_access_carteira(a.carteira_id) is not true
    or not exists(select 1 from public.profiles where id = auth.uid() and role in ('admin','gestor','operador')) then
    raise exception 'Sem permissão para efetivar este acordo.';
  end if;
  if a.tipo is distinct from 'extrajudicial' or a.status in ('cancelado','quitado','quebrado','rompido','renegociado')
    or (a.exige_aprovacao_sindico and a.sindico_aprovado_em is null) then
    raise exception 'O acordo está encerrado ou tem aprovação pendente.';
  end if;
  if p_referencia is null or length(btrim(p_referencia)) not between 1 and 150
    or p_nome_pdf is null or length(btrim(p_nome_pdf)) not between 1 and 180 then
    raise exception 'Confira a referência e o nome do documento.';
  end if;
  if p_pdf_base64 is null or length(p_pdf_base64) > 4194304 then
    raise exception 'Anexe um PDF de até 3 MB.';
  end if;
  v_pdf := decode(p_pdf_base64, 'base64');
  if octet_length(v_pdf) not between 5 and 3145728 or substring(v_pdf from 1 for 5) <> decode('255044462d','hex') then
    raise exception 'O documento precisa ser um PDF válido.';
  end if;
  if jsonb_typeof(p_parcelas) is distinct from 'array' then
    raise exception 'Leia as parcelas do PDF antes de efetivar.';
  end if;
  if jsonb_array_length(p_parcelas) not between 1 and 360 then
    raise exception 'Quantidade de parcelas inválida.';
  end if;
  for item in select value from jsonb_array_elements(p_parcelas) loop
    if jsonb_typeof(item.value->'numero') is distinct from 'number'
      or (item.value->>'numero') !~ '^[0-9]+$'
      or (item.value->>'numero')::numeric > 360
      or jsonb_typeof(item.value->'centavos') is distinct from 'number'
      or (item.value->>'centavos') !~ '^[0-9]+$'
      or (item.value->>'centavos')::numeric not between 1 and 99999999999999
      or jsonb_typeof(item.value->'pago_centavos') is distinct from 'number'
      or (item.value->>'pago_centavos') !~ '^[0-9]+$'
      or (item.value->>'pago_centavos')::numeric > (item.value->>'centavos')::numeric
      or coalesce(item.value->>'vencimento','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
      raise exception 'O documento contém uma parcela inválida.';
    end if;
    perform (item.value->>'vencimento')::date;
  end loop;
  if exists(select 1 from jsonb_to_recordset(p_parcelas) x(numero integer) group by numero having count(*) > 1) then
    raise exception 'O documento repete números de parcelas.';
  end if;
  select sum(centavos)/100, coalesce(sum(centavos) filter(where numero=0),0)/100, count(*) filter(where numero>0)
    into v_total, v_entrada, v_quantidade
    from jsonb_to_recordset(p_parcelas) x(numero integer,centavos numeric);
  if v_total > 999999999999.99 or exists(
    select 1 from jsonb_to_recordset(p_parcelas) x(numero integer) where numero>v_quantidade
  ) then raise exception 'O parcelamento está incompleto ou excede o limite de valores.'; end if;

  perform 1 from public.parcelas_acordo where acordo_id=a.id order by id for update;
  if exists(select 1 from public.parcelas_acordo where acordo_id=a.id group by numero having count(*)>1) then
    raise exception 'O cadastro contém parcelas duplicadas. Revise o acordo antes de importar.';
  end if;
  v_antes := public.acordo_cadastro_para_homologacao(a);
  select not exists(
    (select numero,vencimento,valor from public.parcelas_acordo where acordo_id=a.id
     except select numero,vencimento,centavos/100 from jsonb_to_recordset(p_parcelas) x(numero integer,vencimento date,centavos numeric))
    union all
    (select numero,vencimento,centavos/100 from jsonb_to_recordset(p_parcelas) x(numero integer,vencimento date,centavos numeric)
     except select numero,vencimento,valor from public.parcelas_acordo where acordo_id=a.id)
  ) into v_igual;
  -- O mesmo envio repetido após uma resposta interrompida é inofensivo.
  if v_igual and a.valor_acordado=v_total and exists(
    select 1 from public.acordo_homologacoes_adm h
      cross join lateral public.acordo_baixar_homologacao_adm(h.id) documento
      where h.acordo_id=a.id and decode(documento.pdf_base64,'base64')=v_pdf
      and h.conferido and h.cadastro=v_antes
      and h.referencia=btrim(p_referencia)
  ) then return; end if;
  if public.acordo_revisao_adm(a) is distinct from p_revisao then
    raise exception 'O acordo mudou desde a leitura. Leia o PDF novamente.';
  end if;
  select parcelas_acordo_sem_aprovacao_sindico into v_limite from public.condominios where id=a.condominio_id;
  if coalesce(v_limite,0)>0 and v_quantidade>v_limite and
    (not coalesce(a.exige_aprovacao_sindico,false) or a.sindico_aprovado_em is null or not v_igual or a.valor_acordado<>v_total) then
    raise exception 'As condições do PDF exigem uma nova aprovação do síndico. Revise a proposta antes de efetivar.';
  end if;

  for item in select * from jsonb_to_recordset(p_parcelas)
    x(numero integer,vencimento date,centavos numeric,pago_centavos numeric) order by numero loop
    select * into antiga from public.parcelas_acordo where acordo_id=a.id and numero=item.numero;
    if found then
      if antiga.status='cancelada' then
        raise exception 'O cadastro contém parcela cancelada. Revise o acordo antes de importar.';
      end if;
      if antiga.data_pagamento is not null or antiga.status='paga' then
        if antiga.valor<>item.centavos/100 or antiga.vencimento<>item.vencimento then
          raise exception 'O PDF altera uma parcela com pagamento registrado. Faça a conciliação antes de efetivar.';
        end if;
      else
        if item.pago_centavos>0 then
          raise exception 'O PDF informa pagamento ainda não conciliado. Registre a conciliação antes de efetivar.';
        end if;
        if antiga.valor_repasse_informado is not null and antiga.valor<>item.centavos/100 then
          raise exception 'Uma parcela tem repasse informado manualmente. Revise o repasse antes de alterar o valor.';
        end if;
        if antiga.valor<>item.centavos/100 or antiga.vencimento<>item.vencimento then
          update public.parcelas_acordo set valor=item.centavos/100,vencimento=item.vencimento,
            tipo_parcela=case when item.numero=0 then 'entrada' else 'parcela' end,
            status=case when item.vencimento<v_hoje then 'vencida' else 'aberta' end, updated_at=now()
            where id=antiga.id;
        end if;
      end if;
    else
      if item.pago_centavos>0 then
        raise exception 'O PDF informa pagamento ainda não conciliado. Registre a conciliação antes de efetivar.';
      end if;
      insert into public.parcelas_acordo(acordo_id,numero,valor,vencimento,tipo_parcela,status)
        values(a.id,item.numero,item.centavos/100,item.vencimento,
          case when item.numero=0 then 'entrada' else 'parcela' end,
          case when item.vencimento<v_hoje then 'vencida' else 'aberta' end);
    end if;
  end loop;
  if exists(select 1 from public.parcelas_acordo p where p.acordo_id=a.id
    and not exists(select 1 from jsonb_to_recordset(p_parcelas) x(numero integer) where x.numero=p.numero)
    and (p.data_pagamento is not null or p.status in ('paga','cancelada')
      or exists(select 1 from public.acordos_revisoes r where r.parcela_id=p.id)
      or exists(select 1 from public.fechamento_pagamentos f where f.parcela_id=p.id))) then
    raise exception 'O PDF remove uma parcela com histórico financeiro. Faça a conciliação antes de efetivar.';
  end if;
  delete from public.parcelas_acordo p where p.acordo_id=a.id
    and not exists(select 1 from jsonb_to_recordset(p_parcelas) x(numero integer) where x.numero=p.numero);
  -- Como na revisão de parcelas existente, o total acompanha o plano confirmado.
  -- Os valores históricos das cotas e das despesas da negociação são preservados.
  update public.acordos set valor_acordado=v_total,entrada=v_entrada,
    quantidade_parcelas=v_quantidade,updated_at=now() where id=a.id returning * into a;
  perform public.acordo_registrar_homologacao_adm(a.id,public.acordo_revisao_adm(a),
    p_referencia,p_nome_pdf,p_pdf_base64,true,'');
  v_agora := public.acordo_cadastro_para_homologacao(a);
  insert into public.timeline_operacional(carteira_id,entidade_tipo,entidade_id,evento_tipo,titulo,descricao,
    severidade,acordo_id,usuario_id,origem,payload)
    values(a.carteira_id,'acordo',a.id,'acordo.parcelas_pdf_aplicadas','Parcelas conferidas com o PDF',
      'Plano de pagamento atualizado conforme documento da administradora.','info',a.id,auth.uid(),'manual',
      jsonb_build_object('referencia',btrim(p_referencia),'antes',v_antes,'depois',v_agora));
end
$$;

revoke all on function public.acordo_aplicar_parcelas_pdf_adm(uuid,text,text,text,text,jsonb) from public, anon;
grant execute on function public.acordo_aplicar_parcelas_pdf_adm(uuid,text,text,text,text,jsonb) to authenticated;
notify pgrst, 'reload schema';
commit;
