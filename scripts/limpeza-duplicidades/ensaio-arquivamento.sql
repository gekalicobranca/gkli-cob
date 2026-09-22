-- Protótipo EXCLUSIVO para banco isolado. Não é migração de produção.
-- A integração de consumidores, catálogo completo e concorrência real é requisito
-- de uma futura migração; este arquivo deliberadamente não a substitui.
do $$ begin
  if current_setting('gkli.ambiente_ensaio', true) is distinct from 'isolado' then
    raise exception 'Somente ambiente de ensaio isolado.';
  end if;
end $$;

create schema ensaio_duplicidades;
revoke all on schema ensaio_duplicidades from public;
alter table public.cobrancas
  add column duplicada_de_id uuid references public.cobrancas(id),
  add column duplicidade_lote_id uuid,
  add column duplicidade_arquivada_em timestamptz,
  add constraint duplicidade_sem_autorreferencia check (duplicada_de_id is distinct from id),
  add constraint duplicidade_campos_coerentes check (
    (duplicada_de_id is null and duplicidade_lote_id is null and duplicidade_arquivada_em is null)
    or (duplicada_de_id is not null and duplicidade_lote_id is not null and duplicidade_arquivada_em is not null)
  );

create table ensaio_duplicidades.execucoes (
  lote_id uuid not null, grupo_id text not null,
  preservar_id uuid not null, arquivar_id uuid not null,
  hash_antes text not null, antes jsonb not null, depois jsonb not null,
  criado_em timestamptz not null default now(), revertido_em timestamptz,
  primary key(lote_id, grupo_id), check(preservar_id <> arquivar_id)
);

-- Projeção de referência para testar contagens e somas. A aplicação ainda não a usa.
create view ensaio_duplicidades.cobrancas_canonicas as
select * from public.cobrancas where duplicada_de_id is null;

create function ensaio_duplicidades.snapshot(p_ids uuid[]) returns jsonb
language plpgsql set search_path=pg_catalog,public as $$
declare resultado jsonb; nome text; dados jsonb;
begin
  select jsonb_build_object('cobrancas',coalesce(jsonb_agg(to_jsonb(c) order by c.id),'[]'::jsonb))
    into resultado from public.cobrancas c where c.id=any(p_ids);
  -- Captura integral das tabelas do fixture, incluindo campos JSON e históricos.
  -- Conservador: mudança até em outra mensagem do fixture invalida a autorização.
  foreach nome in array array['mensagens','lote_itens','acordos','acordo_cobrancas',
    'fechamento_pagamentos','email_agenda','email_tentativas','thunderbird_envios','central_pendencias'] loop
    execute format('select coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),''[]''::jsonb) from public.%I t',nome) into dados;
    resultado := resultado || jsonb_build_object(nome,dados);
  end loop;
  return resultado;
end $$;

create function ensaio_duplicidades.hash(p_snapshot jsonb) returns text
language sql immutable as $$ select encode(sha256(convert_to(p_snapshot::text,'UTF8')),'hex') $$;

create function ensaio_duplicidades.aplicar(
  p_lote uuid,p_grupo text,p_preservar uuid,p_arquivar uuid,p_hash text
) returns text language plpgsql set search_path=pg_catalog,public as $$
declare a public.cobrancas; b public.cobrancas; antes jsonb; depois jsonb;
  anterior ensaio_duplicidades.execucoes; ids uuid[] := array[p_preservar,p_arquivar];
begin
  if current_setting('gkli.ambiente_ensaio',true) is distinct from 'isolado' then raise exception 'Somente ensaio isolado.'; end if;
  if p_lote is null or p_grupo is null or p_grupo='' or p_preservar is null or p_arquivar is null or p_preservar=p_arquivar then raise exception 'Identificação inválida.'; end if;
  -- Bloqueio amplo apenas no ensaio; não adaptar para produção sem a janela definida.
  lock table public.cobrancas,public.mensagens,public.lote_itens,public.acordos,
    public.acordo_cobrancas,public.fechamento_pagamentos,public.email_agenda,
    public.email_tentativas,public.thunderbird_envios,public.central_pendencias,
    ensaio_duplicidades.execucoes in share row exclusive mode;
  select * into anterior from ensaio_duplicidades.execucoes where lote_id=p_lote and grupo_id=p_grupo;
  if found then
    if anterior.preservar_id<>p_preservar or anterior.arquivar_id<>p_arquivar or anterior.hash_antes<>p_hash or anterior.revertido_em is not null then raise exception 'Chave de execução reutilizada com outra decisão ou já revertida.'; end if;
    if ensaio_duplicidades.snapshot(ids)<>anterior.depois then raise exception 'Estado posterior mudou.'; end if;
    return 'ja_aplicado';
  end if;
  if (select count(*) from ensaio_duplicidades.execucoes where lote_id=p_lote)>=5 then raise exception 'Limite de cinco grupos no piloto.'; end if;
  antes:=ensaio_duplicidades.snapshot(ids);
  if p_hash is distinct from ensaio_duplicidades.hash(antes) then raise exception 'Snapshot alterado; nova revisão necessária.'; end if;
  select * into strict a from public.cobrancas where id=p_preservar;
  select * into strict b from public.cobrancas where id=p_arquivar;
  if exists(select 1 from pg_constraint fk join pg_class t on t.oid=fk.conrelid
    join pg_namespace n on n.oid=t.relnamespace
    where fk.contype='f' and fk.confrelid='public.cobrancas'::regclass
      and (n.nspname<>'public' or t.relname not in ('cobrancas','mensagens','lote_itens','acordos','acordo_cobrancas','fechamento_pagamentos','central_pendencias')))
    then raise exception 'Dependência fora do inventário do ensaio.'; end if;
  if a.duplicada_de_id is not null or b.duplicada_de_id is not null
    or exists(select 1 from public.cobrancas where duplicada_de_id=any(ids)) then raise exception 'Arquivamento anterior ou cadeia de duplicidade.'; end if;
  if a.unidade_id is null or a.unidade_id is distinct from b.unidade_id
    or a.condominio_id is distinct from b.condominio_id or a.carteira_id is distinct from b.carteira_id
    or a.vencimento is distinct from b.vencimento
    or a.valor_original is distinct from b.valor_original or a.valor_atualizado is distinct from b.valor_atualizado
    or public.cobranca_recibo_identidade(a.observacoes) is null
    or public.cobranca_recibo_identidade(a.observacoes) is distinct from public.cobranca_recibo_identidade(b.observacoes)
    then raise exception 'Identidade ou valores divergentes.'; end if;
  if exists(select 1 from public.cobrancas where id=any(ids) and
    (observacoes ~* '\yrecibo\s+(J|A|AE|AJ)\s+' or status_financeiro is distinct from 'em_aberto'
      or status_operacional not in ('novo','em_cobranca_ativa','em_negociacao') or status_operacional is null
      or status not in ('novo','em_cobranca_ativa','em_negociacao') or status is null)) then raise exception 'Situação exige decisão individual.'; end if;
  if a.competencia is not null and b.competencia is not null and a.competencia<>b.competencia then raise exception 'Competências exigem conciliação.'; end if;
  if exists(select 1 from public.acordos where cobranca_id=any(ids))
    or exists(select 1 from public.acordo_cobrancas where cobranca_id=any(ids))
    or exists(select 1 from public.fechamento_pagamentos where cobranca_id=any(ids)) then raise exception 'Vínculo financeiro impede o piloto simples.'; end if;
  if exists(select 1 from public.central_pendencias where (cobranca_id=any(ids) or entidade_id=any(ids)) and (status not in ('resolvida','cancelada','encerrada') or status is null)) then raise exception 'Pendência aberta exige conciliação.'; end if;
  if exists(select 1 from public.mensagens m where
    (m.cobranca_id=any(ids) or exists(select 1 from jsonb_array_elements_text(coalesce(m.payload->'cobranca_ids','[]'::jsonb)) v where v::uuid=any(ids))
      or exists(select 1 from public.lote_itens i where i.mensagem_id=m.id and i.cobranca_id=any(ids)))
    and ((m.cobranca_id is not null and not(m.cobranca_id=any(ids)))
      or not(coalesce(m.payload->'cobranca_ids','[]'::jsonb) <@ to_jsonb(ids))
      or exists(select 1 from public.lote_itens i where i.mensagem_id=m.id and not(i.cobranca_id=any(ids)))))
    then raise exception 'Mensagem compartilhada com outro débito exige revisão.'; end if;
  -- No fixture são preservadas todas as mensagens. Nada é cancelado ou reagendado.
  if exists(select 1 from public.email_agenda)
    or exists(select 1 from public.email_tentativas where estado not in ('enviado','falha') or estado is null)
    or exists(select 1 from public.thunderbird_envios where estado not in ('enviado','falha') or estado is null)
    or exists(select 1 from public.mensagens where status not in ('enviada','cancelada') or status is null)
    or exists(select 1 from public.lote_itens where status not in ('enviado','cancelado') or status is null)
    then raise exception 'Agenda, mensagem ou tentativa em aberto/incerta impede o ensaio.'; end if;
  update public.cobrancas set duplicada_de_id=p_preservar,duplicidade_lote_id=p_lote,
    duplicidade_arquivada_em=clock_timestamp() where id=p_arquivar;
  depois:=ensaio_duplicidades.snapshot(ids);
  insert into ensaio_duplicidades.execucoes(lote_id,grupo_id,preservar_id,arquivar_id,hash_antes,antes,depois)
    values(p_lote,p_grupo,p_preservar,p_arquivar,p_hash,antes,depois);
  return 'aplicado';
end $$;

create function ensaio_duplicidades.reverter(p_lote uuid,p_grupo text)
returns text language plpgsql set search_path=pg_catalog,public as $$
declare anterior ensaio_duplicidades.execucoes;
begin
  if current_setting('gkli.ambiente_ensaio',true) is distinct from 'isolado' then raise exception 'Somente ensaio isolado.'; end if;
  lock table public.cobrancas,public.mensagens,public.lote_itens,public.acordos,
    public.acordo_cobrancas,public.fechamento_pagamentos,public.email_agenda,
    public.email_tentativas,public.thunderbird_envios,public.central_pendencias,
    ensaio_duplicidades.execucoes in share row exclusive mode;
  select * into strict anterior from ensaio_duplicidades.execucoes where lote_id=p_lote and grupo_id=p_grupo;
  if anterior.revertido_em is not null then return 'ja_revertido'; end if;
  if ensaio_duplicidades.snapshot(array[anterior.preservar_id,anterior.arquivar_id])<>anterior.depois then raise exception 'Estado posterior mudou; reversão automática bloqueada.'; end if;
  update public.cobrancas set duplicada_de_id=null,duplicidade_lote_id=null,duplicidade_arquivada_em=null where id=anterior.arquivar_id;
  if ensaio_duplicidades.snapshot(array[anterior.preservar_id,anterior.arquivar_id])<>anterior.antes then raise exception 'Imagem anterior não restaurada integralmente.'; end if;
  update ensaio_duplicidades.execucoes set revertido_em=clock_timestamp() where lote_id=p_lote and grupo_id=p_grupo;
  return 'revertido';
end $$;

revoke all on all tables in schema ensaio_duplicidades from public;
revoke all on all functions in schema ensaio_duplicidades from public;
