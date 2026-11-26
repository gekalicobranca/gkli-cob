CREATE OR REPLACE FUNCTION public.maestro_cobrancas_substituiveis(p_conversao uuid)
 RETURNS uuid[]
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  with contexto as materialized (
    select id, condominio_id, carteira_id, criado_em, total_cobrancas,
      preview_json->>'captacaoAutomatizada' as automatizada,
      preview_json->>'relatorioCompleto' as completo,
      preview_json->>'parcial' as parcial,
      coalesce(preview_json->>'recorteRegua','todos') as recorte,
      preview_json->>'semPendencias' as sem_pendencias,
      preview_json ? 'escopoBlocosMaestro' as usa_escopo,
      preview_json->'escopoBlocosMaestro' as blocos,
      nullif(preview_json->>'blocoPadraoCaptacao','') as bloco_padrao
    from public.conversoes_relatorio
    where id=p_conversao and origem like 'captacao_automatizada:%'
  ), recibos as materialized (
    select public.cobranca_recibo_identidade('Recibo '||(i->>'recibo')) recibo
    from public.conversoes_relatorio v
    cross join lateral jsonb_array_elements(v.preview_json->'cobrancas') i
    where v.id=p_conversao
  )
  select coalesce(array_agg(c.id order by c.id),'{}'::uuid[])
  from contexto v
  join public.cobrancas c on c.condominio_id=v.condominio_id and c.carteira_id=v.carteira_id
  join public.unidades u on u.id=c.unidade_id and u.condominio_id=v.condominio_id
  where c.conversao_relatorio_id is distinct from v.id
    and c.status_operacional in ('novo','regular','em_cobranca_ativa')
    and c.arquivada_em is null and c.duplicada_de_id is null
    and not coalesce(u.acao_judicial,false)
    and coalesce(c.status_financeiro,'em_aberto') not in ('quitado','pago','baixado','cancelado','renegociado','parcial')
    and c.data_pagamento is null and coalesce(c.valor_pago,0)=0
    and not exists(select 1 from public.acordos a where a.cobranca_id=c.id)
    and not exists(select 1 from public.acordo_cobrancas a where a.cobranca_id=c.id)
    and not exists(select 1 from public.scanner_baixas s where s.cobranca_id=c.id)
    and not exists(select 1 from public.pre_juridico_casos pj where pj.cobranca_id=c.id)
    and (
      (not coalesce(c.automacao_bloqueada,false) and not exists(
        select 1 from public.cobrancas d where d.duplicada_de_id=c.id
      ))
      or (
        c.created_at <= v.criado_em
        and coalesce(c.status,'') not in ('judicializado','suspenso','acordo_firmado','acordo_efetivado','acordo_quebrado')
        and v.automatizada='true'
        and v.completo is distinct from 'false'
        and v.parcial is distinct from 'true'
        and v.recorte='todos'
        and (select count(*) from recibos)=v.total_cobrancas
        and (v.total_cobrancas>0 or v.sem_pendencias='true')
        and public.cobranca_recibo_identidade(c.observacoes) is not null
        -- NOT IN preserva o bloqueio conservador se o relatório tiver recibo nulo.
        and public.cobranca_recibo_identidade(c.observacoes) not in (select r.recibo from recibos r)
      )
    )
    and (not (v.usa_escopo) or upper(trim(u.bloco)) in (
      select upper(trim(value)) from jsonb_array_elements_text(v.blocos)
    ))
    and (v.bloco_padrao is null
      or upper(trim(u.bloco))=upper(trim(v.bloco_padrao)))
$function$
;
