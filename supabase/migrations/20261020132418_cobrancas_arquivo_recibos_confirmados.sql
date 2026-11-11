-- Identidade para revisão administrativa; não altera a trava de novas importações.
create or replace function public.cobranca_recibo_arquivo(observacao text)
returns text language sql immutable parallel safe security invoker set search_path=pg_catalog,public as $$
 select nullif(regexp_replace(coalesce(public.cobranca_recibo_identidade(observacao),
   (regexp_match(observacao,'^Código[[:space:]]+([0-9]+)(?:;|[[:space:]]|$)','i'))[1]),'[.]+$','','g'),'');
$$;
revoke all on function public.cobranca_recibo_arquivo(text) from public,anon,authenticated,service_role;

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
    if lote.antes->'manifesto'->>'versao' = '2' then
      select x into par from jsonb_array_elements(lote.antes->'manifesto'->'pares') x
        where x->>'arquivar_id'=OLD.id::text and x->>'preservar_id'=canonica.id::text;
      confirmado := par is not null
        and par->>'arquivar_sha256'=encode(sha256(convert_to(to_jsonb(OLD)::text,'UTF8')),'hex')
        and par->>'preservar_sha256'=encode(sha256(convert_to(to_jsonb(canonica)::text,'UTF8')),'hex')
        and public.cobranca_recibo_arquivo(OLD.observacoes) is not null
        and public.cobranca_recibo_arquivo(OLD.observacoes)=public.cobranca_recibo_arquivo(canonica.observacoes)
        and par->>'recibo'=public.cobranca_recibo_arquivo(OLD.observacoes);
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
-- Captura referências diretas, polimórficas e embutidas em JSON; somente administração.
create or replace function public.cobrancas_arquivo_snapshot(p_refs uuid[])
returns jsonb language plpgsql security invoker set search_path=pg_catalog,public as $$
declare r record; dados jsonb; resultado jsonb := '{}'::jsonb; padrao text;
begin
 if coalesce(cardinality(p_refs),0)=0 then raise exception 'Referências ausentes'; end if;
 padrao:=array_to_string(p_refs,'|');
 for r in select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and c.relkind='r' and c.relname<>'cobrancas_duplicidade_execucoes'
  and exists(select 1 from pg_attribute a where a.attrelid=c.oid and a.attnum>0 and not a.attisdropped
    and a.atttypid in ('uuid'::regtype,'jsonb'::regtype,'json'::regtype,'uuid[]'::regtype))
  order by c.relname
 loop
  execute format('select coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),''[]''::jsonb) from public.%I t where to_jsonb(t)::text ~ $1',r.relname) into dados using padrao;
  if jsonb_array_length(dados)>0 then resultado:=resultado||jsonb_build_object(r.relname,dados); end if;
 end loop;
 return resultado;
end $$;
revoke all on function public.cobrancas_arquivo_snapshot(uuid[]) from public,anon,authenticated,service_role;
