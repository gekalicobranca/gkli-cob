-- A validação ocorre depois do bloqueio das cobranças e antes de qualquer gravação.
-- Preserva a autenticação, o escopo de carteira e a transação da RPC existente.
do $migration$
declare
  assinatura regprocedure := 'public.criar_acordo_financeiro(uuid,uuid,uuid,uuid,text,text,numeric,numeric,numeric,numeric,date,text,text,boolean,text,text,jsonb,jsonb,text)'::regprocedure;
  definicao text;
  guarda text := $guard$
  -- BLOQUEIO_COBRANCA_EM_OUTRO_ACORDO
  select a.id, a.status into v_conflito
  from public.acordos a
  where coalesce(a.status, '') not in ('cancelado', 'cancelada', 'quebrado', 'rompido', 'renegociado')
    and position('[DUPLICIDADE_ACORDO_CONCILIADA]' in coalesce(a.observacoes, '')) = 0
    and exists (
      select 1 from jsonb_to_recordset(p_itens) as item(cobranca_id uuid)
      where a.cobranca_id = item.cobranca_id
         or exists (select 1 from public.acordo_cobrancas ac
                    where ac.acordo_id = a.id and ac.cobranca_id = item.cobranca_id)
    )
  order by a.id
  limit 1;
  if found then
    raise exception 'Uma das cobranças já pertence ao acordo % (status: %). Edite o acordo em elaboração ou cancele-o antes de criar outro. Consulte /app/acordos/%',
      v_conflito.id, v_conflito.status, v_conflito.id
      using errcode = '23505';
  end if;

$guard$;
begin
  definicao := replace(pg_get_functiondef(assinatura), E'\r', '');
  if position('BLOQUEIO_COBRANCA_EM_OUTRO_ACORDO' in definicao) > 0 then return; end if;
  if position('  v_acordo_id uuid;' in definicao) = 0
     or position('  insert into public.acordos (' in definicao) = 0
     or position(E'  for update;\n' in definicao) = 0 then
    raise exception 'A estrutura de criar_acordo_financeiro mudou; revisar a migração.';
  end if;
  definicao := replace(definicao, '  v_acordo_id uuid;', E'  v_conflito record;\n  v_acordo_id uuid;');
  definicao := replace(definicao, E'  for update;\n', E'  order by c.id\n  for update;\n');
  definicao := replace(definicao, '  insert into public.acordos (', guarda || '  insert into public.acordos (');
  execute definicao;
end;
$migration$;
