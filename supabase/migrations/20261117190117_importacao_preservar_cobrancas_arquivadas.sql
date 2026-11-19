begin;
do $patch$
declare definition text;
begin
  select pg_get_functiondef('public.importacao_substituir_cobrancas_anteriores(uuid)'::regprocedure)
    into definition;

  if position('c.arquivada_em is null' in definition) > 0 then
    raise exception 'Filtro de cobranças arquivadas já existe; revise a migração antes de aplicá-la.';
  end if;
  if position('c.carteira_id=imp.carteira_id and c.duplicada_de_id is null' in definition) = 0 then
    raise exception 'Função de substituição mudou inesperadamente; migração não aplicada.';
  end if;

  definition := replace(
    definition,
    'c.carteira_id=imp.carteira_id and c.duplicada_de_id is null',
    'c.carteira_id=imp.carteira_id and c.duplicada_de_id is null and c.arquivada_em is null'
  );
  execute definition;
end
$patch$;
notify pgrst, 'reload schema';
commit;
