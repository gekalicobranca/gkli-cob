-- Exact duplicates only; one valid equivalent index is retained per pair.
-- No CASCADE. Refuse to queue an exclusive lock behind application queries.
begin;
set local lock_timeout = '1s';
set local statement_timeout = '30s';

do $$
declare pair record; kept record; redundant record;
begin
  for pair in select * from (values
    ('acordos_unidade_idx', 'idx_acordos_unidade_id'),
    ('idx_cobrancas_unidade', 'idx_cobrancas_unidade_id'),
    ('idx_eventos_operacionais_acordo_created', 'idx_eventos_operacionais_acordo_timeline'),
    ('idx_importacoes_carteira_status', 'importacoes_carteira_status_idx'),
    ('idx_lote_itens_mensagem', 'idx_lote_itens_mensagem_id'),
    ('idx_mensagens_acordo_flow', 'idx_mensagens_acordo_flow_status_agenda'),
    ('idx_mensagens_cobranca_flow', 'idx_mensagens_cobranca_flow_status_agenda'),
    ('idx_mensagens_lote_status', 'idx_mensagens_lote_status_operacional'),
    ('idx_mensagens_pre_juridico_flow', 'idx_mensagens_pre_juridico_flow_status_agenda'),
    ('idx_parcelas_acordo_acordo_status_vencimento', 'idx_parcelas_acordo_motor_regua_abertas'),
    ('idx_parcelas_acordo_status_vencimento', 'parcelas_acordo_status_vencimento_idx'),
    ('idx_portal_sindico_condominio', 'idx_portal_sindico_condominios_condominio')
  ) as indexes(keep_name, drop_name) loop
    select i.*, c.relam, c.reloptions, c.reltablespace,
      to_jsonb(i) - 'indexrelid' - 'indcheckxmin' as structure
      into kept from pg_index i join pg_class c on c.oid=i.indexrelid
      where i.indexrelid=to_regclass(format('public.%I',pair.keep_name));
    if not found then raise exception 'Missing retained index: %', pair.keep_name; end if;
    execute format('lock table %s in access exclusive mode nowait',kept.indrelid::regclass);
    select i.*, c.relam, c.reloptions, c.reltablespace,
      to_jsonb(i) - 'indexrelid' - 'indcheckxmin' as structure
      into redundant from pg_index i join pg_class c on c.oid=i.indexrelid
      where i.indexrelid=to_regclass(format('public.%I',pair.drop_name));
    if not found then continue; end if;
    if not kept.indisvalid or not kept.indisready or not kept.indislive
      or not redundant.indisvalid or not redundant.indisready or not redundant.indislive
      or kept.structure is distinct from redundant.structure
      or row(kept.relam,kept.reloptions,kept.reltablespace) is distinct from
         row(redundant.relam,redundant.reloptions,redundant.reltablespace) then
      raise exception 'Indexes are not equivalent and valid: %, %',pair.keep_name,pair.drop_name;
    end if;
    if redundant.indisunique or redundant.indisprimary or redundant.indisexclusion
      or redundant.indisreplident or redundant.indisclustered
      or exists(select 1 from pg_constraint where conindid=redundant.indexrelid)
      or exists(select 1 from pg_depend where refclassid='pg_class'::regclass and refobjid=redundant.indexrelid) then
      raise exception 'Index has integrity/dependency obligations: %',pair.drop_name;
    end if;
    execute format('drop index public.%I',pair.drop_name);
  end loop;
end $$;
commit;
