-- Arquivamento administrativo de cronograma sem recibo, por confirmação humana.
-- Mantém hashes exatos, titular da auditoria, fonte HFlex persistida e acordo comum.
-- Não muda importações, finanças, vínculos ou permissões de aplicação.
CREATE OR REPLACE FUNCTION public.validar_arquivo_duplicidade()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare autorizado boolean; lote public.cobrancas_duplicidade_execucoes; canonica public.cobrancas; par jsonb; confirmado boolean := false;
begin
  if TG_OP='DELETE' then
    if OLD.duplicada_de_id is not null or exists(select 1 from public.cobrancas where duplicada_de_id=OLD.id) then
      raise exception 'Registro preservado pelo histórico de duplicidade; exclusão proibida.';
    end if;
    return OLD;
  end if;
  if TG_OP='INSERT' then
    if NEW.duplicada_de_id is not null or NEW.duplicidade_lote_id is not null or NEW.duplicidade_arquivada_em is not null then
      raise exception 'Arquivamento exige execução auditada.';
    end if;
    return NEW;
  end if;
  if OLD.duplicada_de_id is null and NEW.duplicada_de_id is null
     and OLD.duplicidade_lote_id is not distinct from NEW.duplicidade_lote_id
     and OLD.duplicidade_arquivada_em is not distinct from NEW.duplicidade_arquivada_em then return NEW; end if;
  -- O app não tem permissão de escrita na execução. Uma GUC isolada não autoriza nada.
  if current_user <> pg_get_userbyid((select relowner from pg_class where oid='public.cobrancas_duplicidade_execucoes'::regclass)) then
    raise exception 'Cobrança arquivada ou campos de arquivo protegidos; use o registro preservado.';
  end if;
  select * into lote from public.cobrancas_duplicidade_execucoes
    where lote_id::text=current_setting('gkli.duplicidade_lote',true)
      and estado in ('aplicando','revertendo') and NEW.id=any(arquivar_ids);
  if not found then raise exception 'Execução de arquivamento não autorizada.'; end if;
  if (to_jsonb(NEW)-array['duplicada_de_id','duplicidade_lote_id','duplicidade_arquivada_em','updated_at'])
      is distinct from (to_jsonb(OLD)-array['duplicada_de_id','duplicidade_lote_id','duplicidade_arquivada_em','updated_at']) then
    raise exception 'Arquivamento não pode alterar dados financeiros ou situação de negócio.';
  end if;
  if lote.estado='aplicando' then
    if OLD.duplicada_de_id is not null or NEW.duplicidade_lote_id<>lote.lote_id or not(NEW.duplicada_de_id=any(lote.preservar_ids)) then raise exception 'Decisão diverge da execução.'; end if;
    select * into strict canonica from public.cobrancas where id=NEW.duplicada_de_id for key share;
    -- V2 exige par exato, imagens SHA-256 e recibo reconhecido, sem reescrever encargos.
    if lote.antes->'manifesto'->>'versao' in ('2','3') then
      select x into par from jsonb_array_elements(lote.antes->'manifesto'->'pares') x
        where x->>'arquivar_id'=OLD.id::text and x->>'preservar_id'=canonica.id::text;
      confirmado := par is not null
        and par->>'arquivar_sha256'=encode(sha256(convert_to(to_jsonb(OLD)::text,'UTF8')),'hex')
        and par->>'preservar_sha256'=encode(sha256(convert_to(to_jsonb(canonica)::text,'UTF8')),'hex')
        and (
          (lote.antes->'manifesto'->>'versao' = '2'
            and public.cobranca_recibo_arquivo(OLD.observacoes) is not null
            and public.cobranca_recibo_arquivo(OLD.observacoes)=public.cobranca_recibo_arquivo(canonica.observacoes)
            and par->>'recibo'=public.cobranca_recibo_arquivo(OLD.observacoes))
          or (lote.antes->'manifesto'->>'versao' = '3'
            and par->>'tipo'='cronograma_sem_recibo_confirmado_hflex'
            and par->>'autorizacao_usuario'='true'
            and public.cobranca_recibo_arquivo(OLD.observacoes) is null
            and public.cobranca_recibo_arquivo(canonica.observacoes) is not null
            and par->>'recibo'=public.cobranca_recibo_arquivo(canonica.observacoes)
            and OLD.origem_importacao='Cronogramas agosto/2026 — lista consolidada'
            and OLD.conversao_relatorio_id is null and canonica.conversao_relatorio_id is not null
            and OLD.status_financeiro='quitado' and canonica.status_financeiro='quitado'
            and OLD.status_operacional='acordo_efetivado' and canonica.status_operacional='acordo_efetivado'
            and par->'evidencia'->>'condominio_id'=canonica.condominio_id::text
            and par->'evidencia'->>'unidade_id'=canonica.unidade_id::text
            and par->'evidencia'->>'vencimento'=canonica.vencimento::text
            and (par->'evidencia'->>'valor_original')::numeric=canonica.valor_original
            and par->'evidencia'->>'recibo'=par->>'recibo'
            and par->'evidencia'->>'acordo_portal' ~ '^[0-9]+$'
            and exists(select 1 from public.agente_arquivos af
              join public.agente_execucoes ex on ex.id=af.execucao_id
              join public.agente_receitas re on re.id=ex.receita_id
              where af.id::text=par->'evidencia'->>'arquivo_id'
                and af.hash_arquivo=par->'evidencia'->>'hash_arquivo'
                and af.hash_arquivo ~ '^[0-9a-f]{64}$'
                and ex.status='sucesso' and ex.condominio_id=canonica.condominio_id
                and re.script_key='captacao_hflex')
            and exists(select 1 from public.acordo_cobrancas av
              join public.acordo_cobrancas ac on ac.acordo_id=av.acordo_id
              join public.acordos a on a.id=av.acordo_id
              where av.cobranca_id=OLD.id and ac.cobranca_id=canonica.id
                and a.id::text=par->'evidencia'->>'acordo_id'
                and a.unidade_id=canonica.unidade_id and a.condominio_id=canonica.condominio_id)
          )
        );
      if not coalesce(confirmado,false) then raise exception 'Par confirmado diverge da revisão auditada.'; end if;
    end if;
    if canonica.duplicada_de_id is not null or exists(select 1 from public.cobrancas where duplicada_de_id=NEW.id)
      or canonica.unidade_id is distinct from NEW.unidade_id or canonica.unidade_id is null
      or canonica.carteira_id is distinct from NEW.carteira_id or canonica.condominio_id is distinct from NEW.condominio_id
      or canonica.vencimento is distinct from NEW.vencimento or canonica.valor_original is distinct from NEW.valor_original
      or (not coalesce(confirmado,false) and (
        canonica.valor_atualizado is distinct from NEW.valor_atualizado
        or public.cobranca_recibo_identidade(canonica.observacoes) is null
        or public.cobranca_recibo_identidade(canonica.observacoes) is distinct from public.cobranca_recibo_identidade(NEW.observacoes)))
      then raise exception 'Identidade inválida ou cadeia de cópias.'; end if;
  else
    if OLD.duplicidade_lote_id<>lote.lote_id or NEW.duplicada_de_id is not null then raise exception 'Reversão diverge da execução.'; end if;
  end if;
  return NEW;
end $function$
;

