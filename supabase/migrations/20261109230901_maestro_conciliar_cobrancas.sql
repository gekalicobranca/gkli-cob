begin;

create function public.maestro_iniciar_conciliacao(p_conversao uuid)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  conv public.conversoes_relatorio;
  inicio timestamptz := clock_timestamp();
begin
  select * into strict conv from public.conversoes_relatorio where id=p_conversao for update;
  if coalesce(conv.origem,'') not like 'captacao_automatizada:%'
     or conv.preview_json->>'captacaoAutomatizada' is distinct from 'true' then
    raise exception 'Conversão não pertence a uma captação do Maestro.';
  end if;
  if conv.status in ('concluido','concluido_com_alertas') then
    return jsonb_build_object('jaConfirmada',true);
  end if;
  perform id from public.condominios where id=conv.condominio_id and carteira_id=conv.carteira_id for update;
  if not found then raise exception 'Condomínio fora da carteira da conversão.'; end if;
  if exists (
    select 1 from public.conversoes_relatorio v
    where v.condominio_id=conv.condominio_id and v.carteira_id=conv.carteira_id
      and v.origem like 'captacao_automatizada:%'
      and v.status='processando' and v.atualizado_em>inicio-interval '15 minutes'
  ) then
    raise exception 'Já existe uma captação do Maestro em processamento para o condomínio.';
  end if;
  if exists (
    select 1 from public.conversoes_relatorio v
    where v.condominio_id=conv.condominio_id and v.carteira_id=conv.carteira_id
      and (v.criado_em,v.id)>(conv.criado_em,conv.id) and v.origem like 'captacao_automatizada:%'
      and (v.status in ('concluido','concluido_com_alertas') or v.preview_json ? 'conciliacaoMaestro')
  ) then
    raise exception 'Já existe uma captação mais recente para o condomínio.';
  end if;
  update public.conversoes_relatorio set status='processando', atualizado_em=inicio where id=p_conversao;
  return jsonb_build_object('inicio',inicio);
end $$;

create function public.maestro_conciliar_cobrancas(
  p_conversao uuid, p_inicio timestamptz, p_importadas jsonb, p_valores jsonb, p_conferida boolean
)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  conv public.conversoes_relatorio;
  anterior public.cobrancas;
  depois public.cobrancas;
  linha record;
  arquivar uuid[] := '{}';
  com_acordo integer := 0;
  atualizadas integer := 0;
  arquivadas integer := 0;
  conflitos integer := 0;
  valor_mudou boolean;
  resultado jsonb;
  motivo text;
  nota text := 'Ausente no relatório do Maestro. Conversão ' || p_conversao::text;
  campos_valor text[] := array['valor_atualizado','juros','multa','correcao','conversao_relatorio_id','updated_at'];
  campos_suspensao text[] := array['status','status_operacional','automacao_bloqueada','updated_at'];
begin
  select * into strict conv from public.conversoes_relatorio where id=p_conversao for update;
  if coalesce(conv.origem,'') not like 'captacao_automatizada:%'
     or conv.preview_json->>'captacaoAutomatizada' is distinct from 'true' then
    raise exception 'Conversão não pertence a uma captação do Maestro.';
  end if;
  if conv.status is distinct from 'processando' or conv.atualizado_em is distinct from p_inicio then
    raise exception 'Conversão não pertence ao processamento atual.';
  end if;
  if conv.preview_json ? 'conciliacaoMaestro' then
    return conv.preview_json->'conciliacaoMaestro';
  end if;
  if conv.status in ('concluido','concluido_com_alertas') then
    raise exception 'Conversão já concluída.';
  end if;

  -- Mantém a ordem entre relatórios distintos do mesmo condomínio e protege os
  -- vínculos de acordo por FK enquanto a situação de cada cobrança é conferida.
  perform id from public.condominios where id=conv.condominio_id and carteira_id=conv.carteira_id for update;
  if not found then raise exception 'Condomínio fora da carteira da conversão.'; end if;
  if exists (
    select 1 from public.conversoes_relatorio v
    where v.condominio_id=conv.condominio_id and v.carteira_id=conv.carteira_id
      and (v.criado_em,v.id)>(conv.criado_em,conv.id) and v.origem like 'captacao_automatizada:%'
      and (v.status in ('concluido','concluido_com_alertas') or v.preview_json ? 'conciliacaoMaestro')
  ) then
    return jsonb_build_object('atualizadas',0,'arquivadas',0,'comAcordo',0,
      'motivo','Conciliação ignorada porque já existe uma captação mais recente para o condomínio.');
  end if;
  perform c.id from public.cobrancas c
    where c.condominio_id=conv.condominio_id and c.carteira_id=conv.carteira_id
      and c.duplicada_de_id is null and c.arquivada_em is null
    order by c.id for update;

  if jsonb_typeof(p_valores) is distinct from 'array' then raise exception 'Valores inválidos.'; end if;
  if exists (select 1 from jsonb_array_elements(p_valores) v group by v->>'id' having count(*)>1) then
    raise exception 'Valores repetidos para a mesma cobrança.';
  end if;
  for linha in select * from jsonb_to_recordset(p_valores) as v(
    id uuid, atualizado_em timestamptz, valor_atualizado numeric, juros numeric, multa numeric, correcao numeric
  ) loop
    select c.* into anterior from public.cobrancas c
      where c.id=linha.id and c.condominio_id=conv.condominio_id and c.carteira_id=conv.carteira_id
        and c.arquivada_em is null and c.duplicada_de_id is null;
    if not found or anterior.updated_at is distinct from linha.atualizado_em
       or coalesce(anterior.status_financeiro,'') in ('quitado','pago','cancelado','baixado')
       or coalesce(anterior.status_operacional,'') in ('quitado','pago','cancelado','baixado')
       or linha.valor_atualizado is null or linha.valor_atualizado<=0
       or linha.juros is null or linha.multa is null or linha.correcao is null then
      conflitos := conflitos + 1;
      continue;
    end if;
    valor_mudou := (anterior.valor_atualizado,anterior.juros,anterior.multa,anterior.correcao)
      is distinct from (linha.valor_atualizado,linha.juros,linha.multa,linha.correcao);
    if not valor_mudou and anterior.conversao_relatorio_id=p_conversao then
      continue;
    end if;

    begin
      update public.cobrancas set valor_atualizado=linha.valor_atualizado,
        juros=linha.juros,multa=linha.multa,correcao=linha.correcao,conversao_relatorio_id=p_conversao
        where id=anterior.id returning * into strict depois;
      if (to_jsonb(depois)-campos_valor) is distinct from (to_jsonb(anterior)-campos_valor) then
        raise sqlstate 'PMA01';
      end if;
      if valor_mudou then
        -- Atualiza a linha de origem quando ela representa o mesmo recibo inteiro.
        update public.cobranca_parcelas p set valor_atualizado=depois.valor_atualizado
          where p.cobranca_id=anterior.id and p.status='aberto' and p.data_vencimento=anterior.vencimento
            and p.valor_original=anterior.valor_original and p.valor_atualizado=anterior.valor_atualizado
            and (select count(*) from public.cobranca_parcelas x where x.cobranca_id=anterior.id)=1;
        insert into public.auditoria_eventos(carteira_id,entidade_tipo,entidade_id,evento_tipo,titulo,descricao,antes,depois)
        values(conv.carteira_id,'cobranca',anterior.id,'maestro.valor_atualizado','Valor conciliado com a administradora',
          'Conversão '||p_conversao::text,to_jsonb(anterior),to_jsonb(depois));
        atualizadas := atualizadas + 1;
      end if;
    exception when sqlstate 'PMA01' then
      conflitos := conflitos + 1;
    end;
  end loop;

  if not coalesce(p_conferida,false) or conflitos>0
     or conv.preview_json->>'relatorioCompleto'='false' or conv.preview_json->>'parcial'='true'
     or coalesce(conv.preview_json->>'recorteRegua','todos')<>'todos'
     or jsonb_typeof(p_importadas) is distinct from 'array' then
    motivo := 'Ausências não arquivadas: captação parcial ou com linhas a conferir.';
  elsif jsonb_array_length(p_importadas) is distinct from conv.total_cobrancas
     or (jsonb_array_length(p_importadas)=0 and conv.preview_json->>'semPendencias' is distinct from 'true')
     or (conv.preview_json ? 'escopoBlocosMaestro' and jsonb_typeof(conv.preview_json->'escopoBlocosMaestro') is distinct from 'array')
     or (conv.condominio_id='cb988811-e0ea-45d6-990b-6476271eb109'::uuid and not (conv.preview_json ? 'escopoBlocosMaestro'))
     or exists (select 1 from jsonb_to_recordset(p_importadas) as i(unidade_id uuid,vencimento date)
       where i.vencimento is null or not exists (
         select 1 from public.unidades u where u.id=i.unidade_id and u.condominio_id=conv.condominio_id
       )) then
    motivo := 'Ausências não arquivadas: relatório ou escopo incompleto.';
  else
    with presentes as materialized (
      select i.unidade_id,i.vencimento,public.cobranca_recibo_identidade('Recibo '||i.recibo) recibo
      from jsonb_to_recordset(p_importadas) as i(unidade_id uuid,vencimento date,recibo text)
    ), ausentes as (
      select c.id, (
        exists (select 1 from public.acordos a where a.cobranca_id=c.id) or
        exists (select 1 from public.acordo_cobrancas a where a.cobranca_id=c.id)
      ) vinculado
      from public.cobrancas c join public.unidades u on u.id=c.unidade_id
      cross join lateral (select public.cobranca_recibo_identidade(c.observacoes) recibo) r
      where c.condominio_id=conv.condominio_id and c.carteira_id=conv.carteira_id
        and c.duplicada_de_id is null and c.arquivada_em is null
        and c.created_at<=conv.criado_em and c.updated_at<=conv.criado_em
        and coalesce(c.status_financeiro,'') not in ('quitado','pago','cancelado','baixado','parcial')
        and coalesce(c.status_operacional,'') not in ('quitado','pago','cancelado','baixado')
        and c.data_pagamento is null and coalesce(c.valor_pago,0)=0
        and c.vencimento >= ((conv.criado_em at time zone 'America/Sao_Paulo')::date - interval '5 years')::date
        and (conv.preview_json->>'somenteAnoCorrente' is distinct from 'true'
          or extract(year from c.vencimento)=extract(year from conv.criado_em at time zone 'America/Sao_Paulo'))
        and (not (conv.preview_json ? 'escopoBlocosMaestro') or upper(trim(u.bloco)) in (
          select upper(trim(value)) from jsonb_array_elements_text(conv.preview_json->'escopoBlocosMaestro')
        ))
        and (nullif(conv.preview_json->>'blocoPadraoCaptacao','') is null
          or upper(trim(u.bloco))=upper(trim(conv.preview_json->>'blocoPadraoCaptacao')))
        and not exists (select 1 from presentes p where p.unidade_id=c.unidade_id
          and (p.recibo=r.recibo or (p.vencimento=c.vencimento and (p.recibo is null or r.recibo is null))))
    )
    select coalesce(array_agg(id order by id) filter (where not vinculado),'{}'),
      count(*) filter (where vinculado) into arquivar,com_acordo from ausentes;

    for anterior in select * from public.cobrancas where id=any(arquivar) order by id loop
      begin
        if (anterior.status,anterior.status_operacional,anterior.automacao_bloqueada)
           is distinct from ('suspenso'::text,'suspenso'::text,true) then
          update public.cobrancas set status='suspenso',status_operacional='suspenso',automacao_bloqueada=true
            where id=anterior.id returning * into strict depois;
          if depois.status_operacional is distinct from 'suspenso'
             or (to_jsonb(depois)-campos_suspensao) is distinct from (to_jsonb(anterior)-campos_suspensao) then
            raise sqlstate 'PMA01';
          end if;
          insert into public.auditoria_eventos(carteira_id,entidade_tipo,entidade_id,evento_tipo,titulo,descricao,antes,depois)
          values(conv.carteira_id,'cobranca',anterior.id,'maestro.preparada_retirada',
            'Situação anterior à retirada operacional',nota,to_jsonb(anterior),to_jsonb(depois));
        end if;
        update public.cobrancas set arquivada_em=now(),arquivamento_motivo=nota where id=anterior.id;
        arquivadas := arquivadas + 1;
      exception when sqlstate 'PMA01' then
        conflitos := conflitos + 1;
      end;
    end loop;
  end if;

  if conflitos>0 then
    motivo := concat_ws(' ',motivo,conflitos || ' cobrança(s) com mudança simultânea ou proteção operacional ficaram para conferência.');
  end if;
  resultado := jsonb_strip_nulls(jsonb_build_object('atualizadas',atualizadas,'arquivadas',arquivadas,
    'comAcordo',com_acordo,'motivo',motivo));
  update public.conversoes_relatorio set preview_json=jsonb_set(preview_json,'{conciliacaoMaestro}',resultado)
    where id=p_conversao;
  return resultado;
end $$;

revoke all on function public.maestro_iniciar_conciliacao(uuid),
  public.maestro_conciliar_cobrancas(uuid,timestamptz,jsonb,jsonb,boolean) from public,anon,authenticated;
grant execute on function public.maestro_iniciar_conciliacao(uuid),
  public.maestro_conciliar_cobrancas(uuid,timestamptz,jsonb,jsonb,boolean) to service_role;
commit;
