-- Fixtures transitórias: todas as alterações são revertidas ao final.
begin;
do $$
declare
  carteira uuid;
  condominio uuid;
  piloto record;
  unidade uuid := gen_random_uuid(); cobranca uuid := gen_random_uuid(); caso uuid := gen_random_uuid();
  usuario uuid; dados jsonb; proposta jsonb; aceito jsonb; acordo uuid; vencimento date := (now() at time zone 'America/Sao_Paulo')::date + 7;
begin
 for piloto in select * from (values
 ('2fef8e0b-664e-4aad-b7af-1d702c586065'::uuid,'06827218-e2b1-4267-ad8f-81a0ab222cad'::uuid),
 ('47926d7c-030b-4469-8713-b23eda558a56'::uuid,'36b6c087-56d2-4297-be63-6dcbe02a9f00'::uuid)) p(condominio,carteira) loop
  condominio:=piloto.condominio; carteira:=piloto.carteira;
  unidade:=gen_random_uuid(); cobranca:=gen_random_uuid(); caso:=gen_random_uuid();
  select id into usuario from public.profiles where role='admin' limit 1;
  if usuario is null then raise exception 'Administrador de teste não encontrado.'; end if;
  perform set_config('request.jwt.claims', jsonb_build_object('sub',usuario,'role','authenticated')::text, true);
  insert into public.unidades(id,carteira_id,condominio_id,identificacao,acao_judicial) values(unidade,carteira,condominio,'__VALIDACAO_LIDIA__',false);
  insert into public.cobrancas(id,carteira_id,condominio_id,unidade_id,vencimento,valor_original,valor_atualizado,status,status_operacional,status_financeiro,observacoes)
    values(cobranca,carteira,condominio,unidade,'2026-07-01',100,100,'em_cobranca_ativa','em_cobranca_ativa','em_aberto','MULTA INFRAÇÃO: R$ 0,00');
  insert into public.central_pendencias(id,carteira_id,condominio_id,unidade_id,tipo,origem,status,titulo,payload)
    values(caso,carteira,condominio,unidade,'lidia_atendimento','mensageria','em_tratamento','__VALIDACAO_LIDIA__',
      jsonb_build_object('versao',1,'estado','em_analise','intencao','parcelamento','unidade_ids',jsonb_build_array(unidade),'emails','[]'::jsonb,'atividades','[]'::jsonb,'envio_permitido',false,'modo','supervisionado'));
  dados := jsonb_build_object('base',100,'despesas',10,'total',110,'percentual',10,
    'itens',jsonb_build_array(jsonb_build_object('cobranca_id',cobranca,'valor_atualizado_no_acordo',100,'encargos_no_acordo',10,'valor_total_no_acordo',110)),
    'parcelas',jsonb_build_array(jsonb_build_object('numero',1,'valor',110,'vencimento',vencimento,'tipo_parcela','parcela','status','aberta')));
  -- Os pares trocados devem falhar no RPC real, antes da validação financeira.
  update public.central_pendencias set carteira_id=case when carteira='06827218-e2b1-4267-ad8f-81a0ab222cad'::uuid then '36b6c087-56d2-4297-be63-6dcbe02a9f00'::uuid else '06827218-e2b1-4267-ad8f-81a0ab222cad'::uuid end where id=caso;
  begin
    perform public.lidia_negociar_acordo(caso,unidade,'propor',dados,'Teste carteira incorreta');
    raise exception 'ERRO: carteira incorreta aceita';
  exception when others then if sqlerrm not like 'Atendimento fora do piloto%' then raise; end if; end;
  update public.central_pendencias set carteira_id=carteira,condominio_id=case when condominio='2fef8e0b-664e-4aad-b7af-1d702c586065'::uuid then '47926d7c-030b-4469-8713-b23eda558a56'::uuid else '2fef8e0b-664e-4aad-b7af-1d702c586065'::uuid end where id=caso;
  begin
    perform public.lidia_negociar_acordo(caso,unidade,'propor',dados,'Teste condomínio incorreto');
    raise exception 'ERRO: condomínio incorreto aceito';
  exception when others then if sqlerrm not like 'Atendimento fora do piloto%' then raise; end if; end;
  update public.central_pendencias set condominio_id=condominio where id=caso;
  begin
    perform public.keila_negociar_acordo(caso,unidade,'propor',dados,'Teste isolado');
    raise exception 'ERRO: Keila abriu caso da Lidia';
  exception when others then if sqlerrm not like 'Sem permissão%' then raise; end if; end;
  update public.condominios set operacao_virtual_habilitada=false where id=condominio;
  begin
    perform public.lidia_negociar_acordo(caso,unidade,'propor',dados,'Teste isolado');
    raise exception 'ERRO: autonomia desabilitada ignorada';
  exception when others then if sqlerrm not like 'Agente autônomo desabilitado%' then raise; end if; end;
  update public.condominios set operacao_virtual_habilitada=true,despesas_acordo_avista_percentual=null,despesas_acordo_parcelado_percentual=null,parcelas_acordo_sem_aprovacao_sindico=0 where id=condominio;
  update public.central_pendencias set payload=jsonb_set(payload,'{estado}','"atendimento_humano"') where id=caso;
  begin
    perform public.lidia_negociar_acordo(caso,unidade,'propor',dados,'Teste isolado');
    raise exception 'ERRO: prioridade humana ignorada';
  exception when others then if sqlerrm not like 'Atendimento encerrado ou sob prioridade humana%' then raise; end if; end;
  update public.central_pendencias set payload=jsonb_set(payload,'{estado}','"em_analise"') where id=caso;
  update public.cobrancas set observacoes='MULTA INFRAÇÃO: R$ 50,00' where id=cobranca;
  begin
    perform public.lidia_negociar_acordo(caso,unidade,'propor',dados,'Teste isolado');
    raise exception 'ERRO: multa real incluída';
  exception when others then if sqlerrm not like 'Multa por infração:%' then raise; end if; end;
  update public.cobrancas set observacoes='MULTA INFRAÇÃO: R$ 0,00' where id=cobranca;
  proposta := public.lidia_negociar_acordo(caso,unidade,'propor',dados,'Teste isolado');
  if proposta->>'etapa'<>'possivel_acordo' or (proposta->>'percentual')::numeric<>10 or (select status_operacional from public.cobrancas where id=cobranca)<>'possivel_acordo' then raise exception 'Proposta à vista divergente.'; end if;
  dados := jsonb_build_object('base',100,'despesas',20,'total',120,'percentual',20,
    'itens',jsonb_build_array(jsonb_build_object('cobranca_id',cobranca,'valor_atualizado_no_acordo',100,'encargos_no_acordo',20,'valor_total_no_acordo',120)),
    'parcelas',(select jsonb_agg(jsonb_build_object('numero',n,'valor',30,'vencimento',(vencimento+make_interval(months=>n-1))::date,'tipo_parcela','parcela','status','aberta')) from generate_series(1,4) n));
  proposta := public.lidia_negociar_acordo(caso,unidade,'propor',dados,'Teste isolado');
  if (proposta->>'exige_aprovacao')::boolean then raise exception 'Limite zero interpretado incorretamente.'; end if;
  update public.condominios set parcelas_acordo_sem_aprovacao_sindico=3 where id=condominio;
  proposta := public.lidia_negociar_acordo(caso,unidade,'propor',dados,'Teste isolado');
  if not (proposta->>'exige_aprovacao')::boolean then raise exception 'Aprovação excepcional ignorada.'; end if;
  begin
    perform public.lidia_negociar_acordo(caso,unidade,'aceitar','{}','Teste isolado');
    raise exception 'ERRO: acordo acima do limite firmado';
  exception when others then if sqlerrm not like 'Parcelamento exige aprovação%' then raise; end if; end;
  dados := jsonb_build_object('base',100,'despesas',10,'total',110,'percentual',10,
    'itens',jsonb_build_array(jsonb_build_object('cobranca_id',cobranca,'valor_atualizado_no_acordo',100,'encargos_no_acordo',10,'valor_total_no_acordo',110)),
    'parcelas',jsonb_build_array(jsonb_build_object('numero',1,'valor',110,'vencimento',vencimento,'tipo_parcela','parcela','status','aberta')));
  perform public.lidia_negociar_acordo(caso,unidade,'propor',dados,'Teste isolado');
  aceito := public.lidia_negociar_acordo(caso,unidade,'aceitar','{}','Concordo — aceite simulado exclusivamente nesta transação de teste.');
  acordo := (aceito->>'id')::uuid;
  if aceito->>'etapa'<>'acordo_firmado' or (select status_operacional from public.cobrancas where id=cobranca)<>'acordo_firmado' or (select observacoes from public.acordos where id=acordo) not like 'Lidia:%' then raise exception 'Aceite divergente.'; end if;
  if public.lidia_negociar_acordo(caso,unidade,'aceitar','{}','Teste de idempotência')->>'id'<>acordo::text then raise exception 'Aceite duplicou acordo.'; end if;
  begin
    perform public.agente_virtual_efetivar_acordo(acordo);
    raise exception 'ERRO: acordo efetivado sem pagamento';
  exception when others then if sqlerrm not like 'Efetivação exige aceite e pagamento confirmado%' then raise; end if; end;
  update public.parcelas_acordo set status='paga',data_pagamento=(now() at time zone 'America/Sao_Paulo')::date where acordo_id=acordo;
  perform public.agente_virtual_efetivar_acordo(acordo);
  perform public.keila_efetivar_acordo(acordo); -- compatibilidade da rotina já publicada.
  if (select status_operacional from public.cobrancas where id=cobranca)<>'acordo_efetivado' or (select fluxo_status from public.acordos where id=acordo)<>'acordo_efetivado' or not exists(select 1 from public.central_pendencias c,jsonb_array_elements(c.payload->'acordos') a where c.id=caso and a->>'id'=acordo::text and a->>'etapa'='acordo_efetivado') then raise exception 'Pagamento não sincronizou o atendimento.'; end if;
 end loop;
end $$;
rollback;
select 'Fluxo Lidia validado com rollback: identidade, autonomia, prioridade humana, multas, limites, proposta, aceite, pagamento e idempotência.' as resultado;
