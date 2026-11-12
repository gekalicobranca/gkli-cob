begin;

-- Ao classificar um acordo, reapura somente seus pagamentos. As demais linhas
-- já conferidas no fechamento permanecem intactas, inclusive referências históricas.
do $migration$
declare
  definicao text := pg_get_functiondef('public.apurar_fechamento_mensal(uuid)'::regprocedure);
  cabecalho text := 'public.apurar_fechamento_mensal(p_periodo_id uuid)';
  limpeza text := 'delete from public.fechamento_pagamentos where periodo_id = p_periodo_id;';
  planilha text := 'where (x.acordo_id is null or a.origem_controle = ''carteira'')';
  recebidos text := 'where a.origem_controle = ''carteira'' and p.data_pagamento is not null';
  descricao text := '''Apuracao recalculada com todos os pagamentos recebidos na competencia.''';
begin
  if position(cabecalho in definicao) = 0 or position(limpeza in definicao) = 0
     or position(planilha in definicao) = 0 or position(recebidos in definicao) = 0
     or position(descricao in definicao) = 0 then
    raise exception 'Definição incompatível de apurar_fechamento_mensal';
  end if;

  definicao := replace(definicao, cabecalho, 'public.apurar_fechamento_mensal_interno(p_periodo_id uuid, p_acordo_id uuid)');
  definicao := replace(definicao, limpeza, $sql$
  delete from public.fechamento_pagamentos fp where fp.periodo_id = p_periodo_id
    and (p_acordo_id is null or fp.acordo_id = p_acordo_id or exists (
      select 1 from public.parcelas_acordo p where p.id = fp.parcela_id and p.acordo_id = p_acordo_id
    ));$sql$);
  definicao := replace(definicao, planilha, planilha || $sql$
      and (p_acordo_id is null or x.acordo_id = p_acordo_id or exists (
        select 1 from public.parcelas_acordo p where p.id = x.parcela_id and p.acordo_id = p_acordo_id
      ))$sql$);
  definicao := replace(definicao, recebidos, recebidos || $sql$
      and (p_acordo_id is null or a.id = p_acordo_id)$sql$);
  execute replace(definicao, descricao, $sql$case when p_acordo_id is null then
    'Apuracao recalculada com todos os pagamentos recebidos na competencia.'
    else 'Apuração atualizada pela classificação de origem do acordo ' || p_acordo_id::text end$sql$);
end;
$migration$;

revoke all on function public.apurar_fechamento_mensal_interno(uuid, uuid) from public, anon, authenticated, service_role;

create or replace function public.apurar_fechamento_mensal(p_periodo_id uuid)
returns void language sql security definer set search_path = '' as $$
  select public.apurar_fechamento_mensal_interno(p_periodo_id, null);
$$;

do $migration$
declare
  definicao text := pg_get_functiondef('public.acordo_classificar_origem(uuid,text,text)'::regprocedure);
  chamada text := 'perform public.apurar_fechamento_mensal(periodo);';
begin
  if position(chamada in definicao) = 0 then
    raise exception 'Definição incompatível de acordo_classificar_origem';
  end if;
  execute replace(definicao, chamada, 'perform public.apurar_fechamento_mensal_interno(periodo, p_acordo);');
end;
$migration$;

commit;
