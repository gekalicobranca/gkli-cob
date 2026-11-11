begin;

do $migration$
declare
  fonte text := pg_get_functiondef('public.easy_maestro_painel(uuid[],text)'::regprocedure);
  campo constant text := $sql$'ultimaCaptacaoNoMes', mes.captada_em,$sql$;
  fim constant text := $sql$) mes on true;$sql$;
begin
  if position(campo in fonte)=0 or position(fim in fonte)=0 then
    raise exception 'Painel Easy Maestro fora da versão esperada.';
  end if;

  fonte := replace(fonte,campo,campo||$painel$
      'consolidado', case when consolidado.id is not null then jsonb_build_object(
        'conversaoId', consolidado.id, 'captadoEm', consolidado.atualizado_em
      ) end,
$painel$);
  execute replace(fonte,fim,$painel$) mes on true
  left join lateral (
    select cv.id, cv.atualizado_em
    from public.agente_receitas destino
    join public.agente_execucoes x on x.condominio_id=r.condominio_id
      and x.carteira_id=r.carteira_id and x.administradora_id=r.administradora_id
    join public.agente_arquivos a on a.execucao_id=x.id
    join public.conversoes_relatorio cv on cv.id=a.id and cv.condominio_id=r.condominio_id and cv.carteira_id=r.carteira_id
    where r.condominio_id='cb988811-e0ea-45d6-990b-6476271eb109'::uuid and destino.id=r.receita_id
      and x.origem in ('maestro','maestro_agendada','agenda_mensal')
      and cv.status in ('concluido','concluido_com_alertas')
      and cv.preview_json->'segmentosCaptacao' @> '[{"codigo":"1679"},{"codigo":"1680"},{"codigo":"1681"},{"codigo":"1682"},{"codigo":"1683"}]'::jsonb
      and cv.preview_json->'segmentosCaptacao' @> jsonb_build_array(jsonb_build_object('codigo',
        case destino.config_json->>'portal_segmento'
          when 'SUBCOND 1' then '1680'
          when 'SUBCOND 2' then '1681'
          when 'SUBCOND 3' then '1682'
          when 'SUBCOND 4' then '1683'
        end))
      and (v.id is null or v.status not in ('concluido','concluido_com_alertas') or cv.id=v.id
        or cv.atualizado_em >= e.finalizado_em)
    order by cv.atualizado_em desc, cv.id
    limit 1
  ) consolidado on true;
$painel$);
end $migration$;

commit;
