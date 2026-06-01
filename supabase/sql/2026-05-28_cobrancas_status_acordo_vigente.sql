-- Sincroniza cobranças que já possuem acordo vigente.
-- Corrige casos antigos em que a cobrança continuou como "novo" mesmo com acordo ativo.

update public.cobrancas c
set
  status_operacional = case
    when a.status = 'quitado' or a.status_financeiro = 'quitado' then 'acordo_efetivado'
    else 'acordo_firmado'
  end,
  updated_at = now()
from public.acordos a
where a.cobranca_id = c.id
  and a.status in ('ativo', 'em_dia', 'em_atraso', 'vencido', 'quitado')
  and coalesce(c.status_operacional, '') not in ('acordo_firmado', 'acordo_efetivado', 'judicializado', 'suspenso');

-- A coluna legada `status` aparece em bases diferentes com checks diferentes
-- (algumas usam "acordo firmado"; outras usam "acordo_firmado").
-- Este bloco detecta o formato aceito antes de atualizar, evitando erro de constraint.
do $$
declare
  status_check text;
  valor_firmado text;
  valor_efetivado text;
begin
  select pg_get_constraintdef(oid)
    into status_check
  from pg_constraint
  where conrelid = 'public.cobrancas'::regclass
    and contype = 'c'
    and pg_get_constraintdef(oid) ilike '%status%'
    and pg_get_constraintdef(oid) ilike '%acordo%'
  order by conname
  limit 1;

  if status_check is null then
    return;
  end if;

  if status_check ilike '%acordo_firmado%' then
    valor_firmado := 'acordo_firmado';
    valor_efetivado := 'acordo_efetivado';
  elsif status_check ilike '%acordo firmado%' then
    valor_firmado := 'acordo firmado';
    valor_efetivado := 'acordo efetivado';
  else
    return;
  end if;

  update public.cobrancas c
  set
    status = case
      when a.status = 'quitado' or a.status_financeiro = 'quitado' then valor_efetivado
      else valor_firmado
    end,
    updated_at = now()
  from public.acordos a
  where a.cobranca_id = c.id
    and a.status in ('ativo', 'em_dia', 'em_atraso', 'vencido', 'quitado')
    and coalesce(c.status, '') not in (valor_firmado, valor_efetivado, 'judicializado', 'suspenso');
end $$;
