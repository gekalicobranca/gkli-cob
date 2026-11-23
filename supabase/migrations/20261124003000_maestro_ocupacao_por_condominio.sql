begin;

-- O lote continua protegido pela trava e pelo consentimento versionado.
-- A ocupação operacional é por condomínio, inclusive quando há várias receitas.
do $migration$
declare
  fonte text := pg_get_functiondef('public.easy_maestro_captar(uuid[],text,uuid,uuid,boolean,uuid[])'::regprocedure);
  anterior constant text := 'where (r->>''easy'')::boolean and (';
  novo constant text := 'where (r->>''condominioId'')::uuid = any(p_condominios) and (';
  mensagem constant text := 'raise exception ''Aguarde a captação ou montagem de flow em andamento nesta administradora.'';';
begin
  if position(anterior in fonte)=0 or position(mensagem in fonte)=0 then
    raise exception 'Regra de ocupação do Easy Maestro incompatível';
  end if;
  fonte:=replace(fonte,anterior,novo);
  fonte:=replace(fonte,mensagem,'raise exception ''Um condomínio selecionado já está em captação ou montagem.'' using errcode=''P0M01'';');
  execute fonte;
end $migration$;
commit;
