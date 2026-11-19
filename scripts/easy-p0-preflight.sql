-- Diagnóstico para execução futura, somente no ambiente explicitamente autorizado.
-- Não aplica migrations, não corrige dados e não retorna contatos, valores ou IDs.
begin read only;
set local statement_timeout='30s';
set local lock_timeout='3s';

do $$
declare nome text; campo text; requerido record;
begin
  foreach nome in array array[
    'profiles','usuarios_carteiras','condominios','carteiras','unidades','cobrancas','cobranca_parcelas',
    'conversoes_relatorio','acordos','acordo_cobrancas','scanner_baixas','mensagens','lotes','lote_itens',
    'cobranca_flows','easy_flow_execucoes','reguas','regua_etapas','mensagens_templates','responsaveis_unidades',
    'regua_pausas','regua_compliance_regras','regua_destinatarios_bloqueados','integracoes_smtp_config',
    'integracoes_smtp_rotas_condominio','email_tentativas','email_agenda','whatsapp_web_envios','flow_progressao',
    'maestro_flow_montagens','agente_receitas','agente_administradoras','timeline_operacional','auditoria_eventos',
    'saneamento_cobrancas','captacao_historica_sindico'
  ] loop
    if to_regclass('public.'||nome) is null then raise exception 'P0_PREFLIGHT: tabela ausente: %',nome; end if;
  end loop;
  for requerido in select * from (values
    ('condominios',array['carteira_id','status','vencimento_cota_dia','bloqueio_garantidora_habilitado','bloqueio_garantidora_inicio','bloqueio_garantidora_fim']),
    ('cobrancas',array['carteira_id','condominio_id','unidade_id','status_operacional','status_financeiro','automacao_bloqueada','arquivada_em','duplicada_de_id','data_pagamento','valor_pago']),
    ('cobranca_parcelas',array['cobranca_id','data_vencimento','valor_original','valor_atualizado','status','origem_linha_json']),
    ('mensagens',array['carteira_id','cobranca_id','cobranca_flow_id','lote_id','regua_etapa_id','template_id','fingerprint','payload','status','conteudo','conteudo_renderizado','agendada_para','scheduled_at']),
    ('lote_itens',array['cobranca_id','cobranca_flow_id','lote_id','unidade_id','condominio_id','mensagem_id','regua_etapa_id','status','motivo','payload']),
    ('easy_flow_execucoes',array['condominio_id','carteira_id','criado_por','regua_id','smtp_config_id','status','plano','versoes','config_version','flow_ids','parte','mensagens','liberadas'])
  ) x(tabela,campos) loop
    foreach campo in array requerido.campos loop
      if not exists(select 1 from pg_attribute a where a.attrelid=to_regclass('public.'||requerido.tabela) and a.attname=campo and a.attnum>0 and not a.attisdropped) then
        raise exception 'P0_PREFLIGHT: coluna ausente: %.%',requerido.tabela,campo;
      end if;
    end loop;
  end loop;
  foreach nome in array array[
    'public.easy_preparar_captacao(uuid,text)', 'public.easy_captacao_snapshot(uuid,uuid)',
    'public.email_ativar_flow(uuid,text,uuid)','public.email_reservar_horario(uuid,text,timestamp with time zone)',
    'public.email_smtp_candidatas(uuid)','public.cobranca_recibo_identidade(text)'
  ] loop
    if to_regprocedure(nome) is null then raise exception 'P0_PREFLIGHT: função ausente: %',nome; end if;
  end loop;
  if exists(select 1 from public.easy_flow_execucoes where status in ('preview','montando','entre_partes','pronto','liberando','atencao') group by condominio_id having count(*)>1) then
    raise exception 'P0_PREFLIGHT: execuções Easy Flow conflitantes. Exige revisão; nada foi corrigido.';
  end if;
  if to_regclass('public.easy_flow_condominio_em_andamento') is null then raise exception 'P0_PREFLIGHT: índice Easy Flow ausente.'; end if;
end $$;

select 'execucoes_bloqueantes' as verificacao,count(*) as quantidade
  from public.easy_flow_execucoes where status in ('preview','montando','entre_partes','pronto','liberando','atencao');
select 'schema_preflight_conferido_sem_mutacao' as resultado;
rollback;
