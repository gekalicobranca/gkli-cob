begin;

-- A execução continua em_execucao durante o POST de validação/importação.
-- Só um arquivo da própria tentativa representa progresso da coleta atual.
do $migration$
declare
  fonte text := pg_get_functiondef('public.easy_maestro_painel(uuid[],text)'::regprocedure);
  estado_anterior constant text := 'when e.status = ''em_execucao'' then ''captando''';
  estado_novo constant text := $estado$when e.status = 'em_execucao' then case
    when e.origem in ('maestro','maestro_agendada','agenda_mensal') and exists(
      select 1 from public.agente_arquivos ar where ar.execucao_id=e.id
        and ar.created_at>=coalesce(e.iniciado_em,e.created_at)
    ) then 'importando' else 'captando' end$estado$;
  vinculo constant text := 'where a.execucao_id = e.id and v.condominio_id = r.condominio_id and v.carteira_id = r.carteira_id';
begin
  if position(estado_anterior in fonte)=0 or position(vinculo in fonte)=0 then
    raise exception 'Definição do painel incompatível com a identificação da tentativa atual';
  end if;
  fonte := replace(fonte,estado_anterior,estado_novo);
  fonte := replace(fonte,vinculo,vinculo || $vinculo$
    and (e.status <> 'em_execucao' or a.created_at>=coalesce(e.iniciado_em,e.created_at))$vinculo$);
  execute fonte;
end $migration$;
notify pgrst,'reload schema';
commit;
