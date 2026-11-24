begin;

-- A mesma RPC atende o Maestro e o Easy Maestro. Manter os bloqueios da
-- conversão e conferir os transportes antes de conciliar valores ou remover cotas.
do $migration$
declare
  fonte text := replace(pg_get_functiondef('public.maestro_substituir_captacao(uuid,timestamptz,uuid[],jsonb,jsonb,jsonb,jsonb)'::regprocedure), E'\r\n', E'\n');
  ancora constant text := '  with recibos as materialized (';
  resultado_antigo constant text := '''preservadas'',preservadas,''semReciboCorrespondente'',sem_recibo';
begin
  if position(ancora in fonte)=0 or position('  resultado jsonb;' in fonte)=0 or position(resultado_antigo in fonte)=0 then
    raise exception 'Revisar a definição da substituição do Maestro antes de aplicar.';
  end if;
  fonte := replace(fonte,'  resultado jsonb;', $vars$
  resultado jsonb;
  unidades_escopo uuid[];
  cotas_escopo uuid[];
  mensagens_escopo uuid[];
  unidades_retidas uuid[];
  linhas_retidas integer := 0;
$vars$);
  fonte := replace(fonte,ancora,$sql$
  select array(select distinct unidade_id from (
    select unidade_id from public.cobrancas where id=any(ids)
    union select unidade_id from jsonb_to_recordset(p_importadas) i(unidade_id uuid)
  ) s) into unidades_escopo;
  select array(select c.id from public.cobrancas c where c.condominio_id=imp.condominio_id
    and c.carteira_id=imp.carteira_id and c.unidade_id=any(unidades_escopo)) into cotas_escopo;

  -- O transporte também reserva a mensagem sob lock. Ler o estado depois de obter
  -- os locks impede que uma reserva recente seja confundida com um cancelamento.
  select array(select m.id from public.mensagens m where
    m.cobranca_id=any(cotas_escopo) or (m.payload->'cobranca_ids') ?| cotas_escopo::text[]
    or (m.carteira_id=imp.carteira_id and m.unidade_id=any(unidades_escopo))
    order by m.id for update) into mensagens_escopo;

  with pendentes as materialized (
    select m.* from public.mensagens m where m.id=any(mensagens_escopo) and (
      m.status in ('em_envio','enviando','incerto') or m.status_operacional in ('em_envio','enviando','incerto')
      or exists(select 1 from public.email_tentativas t where t.mensagem_id=m.id and t.estado in ('em_envio','incerto'))
      or exists(select 1 from public.thunderbird_envios t where t.mensagem_id=m.id and t.estado in ('reservado','enviando','incerto'))
      or exists(select 1 from public.whatsapp_web_envios w where w.mensagem_id=m.id and w.estado in ('reservado','incerto'))
    )
  ), afetadas as (
    select c.unidade_id from public.cobrancas c join pendentes m
      on c.id=m.cobranca_id or (m.payload->'cobranca_ids') ? c.id::text
      where c.id=any(cotas_escopo)
    union select m.unidade_id from pendentes m where m.carteira_id=imp.carteira_id and m.unidade_id=any(unidades_escopo)
  ) select array(select unidade_id from afetadas order by unidade_id) into unidades_retidas;

  if cardinality(unidades_retidas)>0 then
    select count(*) into linhas_retidas from jsonb_to_recordset(p_importadas) i(unidade_id uuid)
      where i.unidade_id=any(unidades_retidas);
    select array(select c.id from public.cobrancas c where c.id=any(ids)
      and not(c.unidade_id=any(unidades_retidas)) order by c.id) into ids;
    select coalesce(jsonb_agg(v),'[]') into p_valores from jsonb_array_elements(p_valores) v
      where not exists(select 1 from public.cobrancas c where c.id=(v->>'id')::uuid and c.unidade_id=any(unidades_retidas));
    -- Manter as parcelas das demais cotas e as validações de integridade de seus IDs.
    select coalesce(jsonb_agg(p),'[]') into p_parcelas from jsonb_array_elements(p_parcelas) p
      where not exists(select 1 from jsonb_to_recordset(p_novas) n(id uuid,unidade_id uuid)
        where n.id=(p->>'cobranca_id')::uuid and n.unidade_id=any(unidades_retidas));
    select coalesce(jsonb_agg(n),'[]') into p_novas from jsonb_array_elements(p_novas) n
      where not ((n->>'unidade_id')::uuid=any(unidades_retidas));
  end if;
$sql$||ancora);
  fonte := replace(fonte,resultado_antigo,resultado_antigo||',''unidadesComEnvioPendente'',unidades_retidas,''linhasComEnvioPendente'',linhas_retidas');
  -- Guarda final para vínculos materializados depois da primeira leitura.
  fonte := replace(fonte,'m.id=any(mensagens_ids) and m.status=''em_envio''',
    'm.id=any(mensagens_ids) and (m.status in (''em_envio'',''incerto'',''enviando'') or m.status_operacional in (''em_envio'',''incerto'',''enviando''))');
  fonte := replace(fonte,'t.mensagem_id=any(mensagens_ids) and t.estado=''em_envio''',
    't.mensagem_id=any(mensagens_ids) and t.estado in (''em_envio'',''incerto'')');
  fonte := replace(fonte,'t.mensagem_id=any(mensagens_ids) and t.estado=''reservado'') then',
    $guard$t.mensagem_id=any(mensagens_ids) and t.estado in ('reservado','incerto'))
    or exists(select 1 from public.thunderbird_envios t where t.mensagem_id=any(mensagens_ids) and t.estado in ('reservado','enviando','incerto')) then$guard$);
  execute fonte;
end $migration$;

commit;
