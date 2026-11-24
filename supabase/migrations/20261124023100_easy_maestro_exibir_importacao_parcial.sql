begin;
do $migration$
declare
  fonte text:=pg_get_functiondef('public.easy_maestro_painel(uuid[],text)'::regprocedure);
  proj constant text:='select v.id, v.status, v.total_cobrancas';
  campo constant text:='''cobrancas'', v.total_cobrancas';
  detalhe constant text:='when v.status = ''concluido_com_alertas'' then';
  mensal constant text:='and cv.status in (''concluido'',''concluido_com_alertas'')';
begin
  if position(proj in fonte)=0 or position(campo in fonte)=0 or position(detalhe in fonte)=0 or position(mensal in fonte)=0 then
    raise exception 'Revisar o painel Easy Maestro antes de aplicar.';
  end if;
  fonte:=replace(fonte,proj,proj||$s$, coalesce(jsonb_array_length(v.preview_json#>'{conciliacaoMaestro,unidadesComEnvioPendente}'),0) retidas,
    coalesce((v.preview_json#>>'{conciliacaoMaestro,linhasComEnvioPendente}')::int,0) linhas_retidas$s$);
  fonte:=replace(fonte,campo,$s$'unidadesComEnvioPendente', v.retidas, 'cobrancas', v.total_cobrancas-v.linhas_retidas$s$);
  fonte:=replace(fonte,detalhe,$s$when v.retidas>0 then format('%s unidade(s) aguardam conferência de envio. Confira a mensagem na conta de origem e retome essas unidades em nova captação.',v.retidas)
        $s$||detalhe);
  execute replace(fonte,mensal,mensal||$s$ and coalesce(jsonb_array_length(cv.preview_json#>'{conciliacaoMaestro,unidadesComEnvioPendente}'),0)=0$s$);
end $migration$;
commit;
