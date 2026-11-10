begin;

do $migration$
declare
  fonte text := pg_get_functiondef('public.easy_maestro_painel(uuid[],text)'::regprocedure);
  campo text := $anchor$'liberacaoEm', r.liberacao_em,$anchor$;
  fim text := $anchor$) v on true;$anchor$;
begin
  if position(campo in fonte)=0 or position(fim in fonte)=0 then
    raise exception 'Painel Easy Maestro fora da versão esperada.';
  end if;

  fonte := replace(fonte,campo,campo||$painel$
      'ultimaCaptacaoNoMes', mes.captada_em,
$painel$);
  -- A captação do mês é independente da execução que o painel acompanha agora.
  fonte := replace(fonte,fim,$painel$) v on true
  left join lateral (
    select max(captacao.captada_em) captada_em
    from public.agente_execucoes x
    left join public.agente_arquivos a on a.execucao_id=x.id
    left join public.conversoes_relatorio cv on cv.id=a.id
      and cv.carteira_id=r.carteira_id and cv.condominio_id=r.condominio_id
      and cv.status in ('concluido','concluido_com_alertas')
    cross join lateral (
      select case
        when cv.id is not null then cv.atualizado_em
        when x.status='sucesso' and exists (
          select 1 from public.agente_logs l where l.execucao_id=x.id and l.step='sem_inadimplencia'
        ) then x.finalizado_em
      end captada_em
    ) captacao
    where x.carteira_id=r.carteira_id and x.condominio_id=r.condominio_id
      and x.origem in ('maestro','maestro_agendada','agenda_mensal')
      and captacao.captada_em >= (date_trunc('month',now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo')
      and captacao.captada_em <= now()
  ) mes on true;
$painel$);
  execute fonte;
end
$migration$;

commit;
