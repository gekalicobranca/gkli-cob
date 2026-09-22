begin;
set local lock_timeout='5s';

alter table public.cobrancas
  add column duplicada_de_id uuid references public.cobrancas(id),
  add column duplicidade_lote_id uuid,
  add column duplicidade_arquivada_em timestamptz,
  add constraint cobrancas_duplicidade_sem_ciclo check(duplicada_de_id is distinct from id),
  add constraint cobrancas_duplicidade_campos check(
    (duplicada_de_id is null and duplicidade_lote_id is null and duplicidade_arquivada_em is null)
    or (duplicada_de_id is not null and duplicidade_lote_id is not null and duplicidade_arquivada_em is not null));
create index cobrancas_canonicas_fila on public.cobrancas(carteira_id,status_operacional,id) where duplicada_de_id is null;

create table public.cobrancas_duplicidade_execucoes (
  lote_id uuid primary key,
  manifesto_sha256 text not null check(length(manifesto_sha256)=64),
  estado text not null check(estado in ('aplicando','aplicado','revertendo','revertido')),
  preservar_ids uuid[] not null,
  arquivar_ids uuid[] not null,
  antes jsonb not null,
  depois jsonb,
  criado_em timestamptz not null default now(),
  revertido_em timestamptz
);
alter table public.cobrancas_duplicidade_execucoes enable row level security;
revoke all on public.cobrancas_duplicidade_execucoes from public,anon,authenticated,service_role;

create view public.cobrancas_canonicas with(security_invoker=true) as
select * from public.cobrancas where duplicada_de_id is null;
revoke all on public.cobrancas_canonicas from public,anon;
grant select on public.cobrancas_canonicas to authenticated,service_role;

create function public.validar_arquivo_duplicidade() returns trigger
language plpgsql set search_path=pg_catalog,public as $$
declare autorizado boolean; lote public.cobrancas_duplicidade_execucoes; canonica public.cobrancas;
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
    if canonica.duplicada_de_id is not null or exists(select 1 from public.cobrancas where duplicada_de_id=NEW.id)
      or canonica.unidade_id is distinct from NEW.unidade_id or canonica.unidade_id is null
      or canonica.carteira_id is distinct from NEW.carteira_id or canonica.condominio_id is distinct from NEW.condominio_id
      or canonica.vencimento is distinct from NEW.vencimento or canonica.valor_original is distinct from NEW.valor_original
      or canonica.valor_atualizado is distinct from NEW.valor_atualizado
      or public.cobranca_recibo_identidade(canonica.observacoes) is null
      or public.cobranca_recibo_identidade(canonica.observacoes) is distinct from public.cobranca_recibo_identidade(NEW.observacoes)
      then raise exception 'Identidade inválida ou cadeia de cópias.'; end if;
  else
    if OLD.duplicidade_lote_id<>lote.lote_id or NEW.duplicada_de_id is not null then raise exception 'Reversão diverge da execução.'; end if;
  end if;
  return NEW;
end $$;
create trigger z_validar_arquivo_duplicidade before insert or update or delete on public.cobrancas
for each row execute function public.validar_arquivo_duplicidade();

create function public.mensagem_contem_cobranca_arquivada(m public.mensagens) returns boolean
language sql stable security definer set search_path=pg_catalog,public as $$
select exists(select 1 from public.cobrancas c where c.duplicada_de_id is not null
  and (c.id=m.cobranca_id or coalesce(m.payload->'cobranca_ids','[]'::jsonb) @> jsonb_build_array(c.id::text)
    or exists(select 1 from public.lote_itens i where i.mensagem_id=m.id and i.cobranca_id=c.id)));
$$;

create function public.impedir_operacao_em_copia() returns trigger
language plpgsql security definer set search_path=pg_catalog,public as $$
declare cid uuid; bloqueada boolean;
begin
  cid:=nullif(to_jsonb(NEW)->>'cobranca_id','')::uuid;
  select exists(select 1 from public.cobrancas where id=cid and duplicada_de_id is not null) into bloqueada;
  if TG_TABLE_NAME='mensagens' then
    bloqueada:=bloqueada or public.mensagem_contem_cobranca_arquivada(NEW);
    -- Comprovantes posteriores podem atualizar mensagens já terminais; nunca reenviar.
    if TG_OP='UPDATE' and OLD.status in ('enviada','cancelada') and NEW.status=OLD.status
      and OLD.cobranca_id is not distinct from NEW.cobranca_id
      and OLD.payload is not distinct from NEW.payload
      and OLD.conteudo is not distinct from NEW.conteudo
      and OLD.conteudo_renderizado is not distinct from NEW.conteudo_renderizado then return NEW; end if;
  end if;
  if bloqueada then raise exception 'Cobrança arquivada por duplicidade não aceita nova operação. Use o registro preservado.'; end if;
  return NEW;
end $$;
do $$ declare tabela text; begin
  foreach tabela in array array['acordos','acordo_cobrancas','cobranca_parcelas','fechamento_pagamentos','mensagens','lote_itens','pre_juridico_casos','solicitacoes_administradora','regua_pausas'] loop
    execute format('create trigger z_impedir_operacao_em_copia before insert or update on public.%I for each row execute function public.impedir_operacao_em_copia()',tabela);
  end loop;
end $$;
revoke all on function public.validar_arquivo_duplicidade(),public.impedir_operacao_em_copia(),public.mensagem_contem_cobranca_arquivada(public.mensagens) from public,anon,authenticated,service_role;
grant execute on function public.mensagem_contem_cobranca_arquivada(public.mensagens) to service_role;
comment on column public.cobrancas.duplicada_de_id is 'Cópia preservada como histórico; fora das operações e totais. Não representa suspensão ou quitação.';
commit;
