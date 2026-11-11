begin;

alter table public.cobrancas add column duplicada_origem_excluida_id uuid,
  add constraint cobrancas_copia_com_origem_excluida check (
    duplicada_origem_excluida_id is null or (arquivada_em is not null and duplicada_de_id is null)
  );

create or replace function public.maestro_cobrancas_substituiveis(p_conversao uuid) returns uuid[]
language sql stable security invoker set search_path='' as $$
  with recibos as materialized (
    select public.cobranca_recibo_identidade('Recibo '||(i->>'recibo')) recibo
    from public.conversoes_relatorio v
    cross join lateral jsonb_array_elements(v.preview_json->'cobrancas') i
    where v.id=p_conversao
  )
  select coalesce(array_agg(c.id order by c.id),'{}'::uuid[])
  from public.conversoes_relatorio v
  join public.cobrancas c on c.condominio_id=v.condominio_id and c.carteira_id=v.carteira_id
  join public.unidades u on u.id=c.unidade_id and u.condominio_id=v.condominio_id
  where v.id=p_conversao and v.origem like 'captacao_automatizada:%'
    and c.conversao_relatorio_id is distinct from v.id
    and c.status_operacional in ('novo','regular','em_cobranca_ativa')
    and c.arquivada_em is null and c.duplicada_de_id is null
    and not coalesce(u.acao_judicial,false)
    and coalesce(c.status_financeiro,'em_aberto') not in ('quitado','pago','baixado','cancelado','renegociado','parcial')
    and c.data_pagamento is null and coalesce(c.valor_pago,0)=0
    and not exists(select 1 from public.acordos a where a.cobranca_id=c.id)
    and not exists(select 1 from public.acordo_cobrancas a where a.cobranca_id=c.id)
    and not exists(select 1 from public.scanner_baixas s where s.cobranca_id=c.id)
    and (
      (not coalesce(c.automacao_bloqueada,false) and not exists(
        select 1 from public.cobrancas d where d.duplicada_de_id=c.id
      ))
      or (
        c.created_at <= v.criado_em
        and coalesce(c.status,'') not in ('judicializado','suspenso','acordo_firmado','acordo_efetivado','acordo_quebrado')
        and v.preview_json->>'captacaoAutomatizada'='true'
        and v.preview_json->>'relatorioCompleto' is distinct from 'false'
        and v.preview_json->>'parcial' is distinct from 'true'
        and coalesce(v.preview_json->>'recorteRegua','todos')='todos'
        and (select count(*) from recibos)=v.total_cobrancas
        and (v.total_cobrancas>0 or v.preview_json->>'semPendencias'='true')
        and public.cobranca_recibo_identidade(c.observacoes) is not null
        and not exists(select 1 from recibos r
          where r.recibo is null or r.recibo=public.cobranca_recibo_identidade(c.observacoes))
      )
    )
    and (not (v.preview_json ? 'escopoBlocosMaestro') or upper(trim(u.bloco)) in (
      select upper(trim(value)) from jsonb_array_elements_text(v.preview_json->'escopoBlocosMaestro')
    ))
    and (nullif(v.preview_json->>'blocoPadraoCaptacao','') is null
      or upper(trim(u.bloco))=upper(trim(v.preview_json->>'blocoPadraoCaptacao')))
$$;

-- Uma cópia já descartada continua no arquivo quando o recibo original some.
-- Só a rotina administrativa abaixo pode transferir a cópia para o arquivo operacional.
do $migration$
declare
  definicao text;
  alvo regprocedure;
  guarda constant text := $sql$
  if TG_OP='UPDATE' and OLD.duplicada_de_id is not null
     and current_user=pg_get_userbyid((select relowner from pg_class where oid='public.cobrancas_duplicidade_execucoes'::regclass))
     and current_setting('gkli.maestro_origem_copia_excluida',true)=OLD.duplicada_de_id::text
     and NEW.duplicada_de_id is null and NEW.duplicidade_lote_id is null and NEW.duplicidade_arquivada_em is null
     and NEW.duplicada_origem_excluida_id=OLD.duplicada_de_id
     and NEW.arquivada_em is not null and NEW.automacao_bloqueada is true
     and length(trim(NEW.arquivamento_motivo))>=10
     and (to_jsonb(NEW)-array['duplicada_de_id','duplicidade_lote_id','duplicidade_arquivada_em','duplicada_origem_excluida_id',
        'arquivada_em','arquivamento_motivo','automacao_bloqueada','updated_at']) is not distinct from
         (to_jsonb(OLD)-array['duplicada_de_id','duplicidade_lote_id','duplicidade_arquivada_em','duplicada_origem_excluida_id',
        'arquivada_em','arquivamento_motivo','automacao_bloqueada','updated_at']) then
    return NEW;
  end if;
$sql$;
begin
  foreach alvo in array array[
    'public.validar_arquivo_duplicidade()'::regprocedure,
    'public.proteger_arquivo_operacional_cobranca()'::regprocedure
  ] loop
    definicao := replace(pg_get_functiondef(alvo),E'\r\n',E'\n');
    if position(E'begin\n' in definicao)=0 then
      raise exception 'Proteção de arquivo fora da versão esperada: %',alvo;
    end if;
    if alvo='public.validar_arquivo_duplicidade()'::regprocedure then
      definicao := overlay(definicao placing E'begin\n'||$sql$
  if (TG_OP='INSERT' and NEW.duplicada_origem_excluida_id is not null)
     or (TG_OP='UPDATE' and NEW.duplicada_origem_excluida_id is distinct from OLD.duplicada_origem_excluida_id) then
    raise exception 'Origem de cópia excluída exige captação auditada.';
  end if;
$sql$ from position(E'begin\n' in definicao) for 6);
    end if;
    execute overlay(definicao placing E'begin\n'||guarda from position(E'begin\n' in definicao) for 6);
  end loop;
end $migration$;

-- A cópia histórica não ocupa o recibo se ele reaparecer em uma captação futura.
do $migration$
declare
  definicao text := pg_get_functiondef('public.manter_cobrancas_recibo_guard()'::regprocedure);
begin
  if position('if TG_OP <> ''INSERT'' then recibo_antigo' in definicao)=0
     or position('if TG_OP <> ''DELETE'' then recibo_novo' in definicao)=0 then
    raise exception 'Inventário de recibos fora da versão esperada.';
  end if;
  definicao := replace(definicao,'if TG_OP <> ''INSERT'' then recibo_antigo',
    'if TG_OP <> ''INSERT'' and OLD.duplicada_origem_excluida_id is null then recibo_antigo');
  execute replace(definicao,'if TG_OP <> ''DELETE'' then recibo_novo',
    'if TG_OP <> ''DELETE'' and NEW.duplicada_origem_excluida_id is null then recibo_novo');
end $migration$;
drop trigger cobrancas_recibo_guard_update on public.cobrancas;
create trigger cobrancas_recibo_guard_update after update of unidade_id,observacoes,duplicada_origem_excluida_id on public.cobrancas
for each row execute function public.manter_cobrancas_recibo_guard();

create function public.maestro_arquivar_copias_de_ausentes(p_conversao uuid,p_ids uuid[]) returns integer
language plpgsql security definer set search_path=pg_catalog,public as $$
declare
  conversao public.conversoes_relatorio;
  origem uuid;
  quantidade integer := 0;
  copiadas integer;
  anterior text := current_setting('gkli.maestro_origem_copia_excluida',true);
begin
  if not exists(select 1 from public.cobrancas where duplicada_de_id=any(p_ids)) then return 0; end if;
  select * into strict conversao from public.conversoes_relatorio where id=p_conversao for update;
  perform id from public.condominios where id=conversao.condominio_id for update;
  perform id from public.cobrancas where id=any(p_ids) or duplicada_de_id=any(p_ids) order by id for update;
  if not (p_ids <@ public.maestro_cobrancas_substituiveis(p_conversao))
     or exists(select 1 from public.conversoes_relatorio v
       where v.condominio_id=conversao.condominio_id and v.carteira_id=conversao.carteira_id
         and v.origem like 'captacao_automatizada:%'
         and (v.criado_em,v.id)>(conversao.criado_em,conversao.id)
         and (v.status in ('concluido','concluido_com_alertas') or v.preview_json ? 'conciliacaoMaestro')) then
    raise exception 'As cobranças não podem ser excluídas por esta captação.';
  end if;
  for origem in select distinct duplicada_de_id from public.cobrancas where duplicada_de_id=any(p_ids) loop
    perform set_config('gkli.maestro_origem_copia_excluida',origem::text,true);
    with antes as materialized (
      select * from public.cobrancas where duplicada_de_id=origem
    ), depois as (
      update public.cobrancas c set duplicada_de_id=null,duplicidade_lote_id=null,duplicidade_arquivada_em=null,
        duplicada_origem_excluida_id=origem,
        arquivada_em=coalesce(c.arquivada_em,c.duplicidade_arquivada_em,now()),
        arquivamento_motivo=coalesce(c.arquivamento_motivo,'Cópia arquivada; cobrança original ausente na captação.'),
        automacao_bloqueada=true
      from antes a where c.id=a.id returning c.*
    )
    insert into public.auditoria_eventos(carteira_id,entidade_tipo,entidade_id,evento_tipo,titulo,descricao,antes,depois)
    select d.carteira_id,'cobranca',d.id,'maestro.copia_preservada','Cópia preservada no arquivo',
      'Conversão '||p_conversao::text,to_jsonb(a),to_jsonb(d) from antes a join depois d on d.id=a.id;
    get diagnostics copiadas=row_count;
    quantidade := quantidade+copiadas;
  end loop;
  perform set_config('gkli.maestro_origem_copia_excluida',coalesce(anterior,''),true);
  return quantidade;
end $$;

revoke all on function public.maestro_arquivar_copias_de_ausentes(uuid,uuid[]) from public,anon,authenticated;
grant execute on function public.maestro_arquivar_copias_de_ausentes(uuid,uuid[]) to service_role;

do $migration$
declare
  definicao text := pg_get_functiondef('public.maestro_substituir_captacao(uuid,timestamptz,uuid[],jsonb,jsonb,jsonb,jsonb)'::regprocedure);
  alvo constant text := '  delete from public.cobrancas where id=any(ids);';
begin
  if position(alvo in definicao)=0 then raise exception 'Exclusão do Maestro fora da versão esperada.'; end if;
  execute replace(definicao,alvo,'  perform public.maestro_arquivar_copias_de_ausentes(p_conversao,ids);'||E'\n'||alvo);
end $migration$;

commit;
