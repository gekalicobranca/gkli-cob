-- Mantém telefone e todas as políticas existentes para compatibilidade.
alter table public.responsaveis_unidades
  add column if not exists celular text,
  add column if not exists telefone_fixo text,
  add column if not exists telefone_outros text;

comment on column public.responsaveis_unidades.celular is 'Celulares brasileiros válidos em formato 55+DDD+número; múltiplos separados por |.';
comment on column public.responsaveis_unidades.telefone_fixo is 'Telefones fixos brasileiros válidos em formato 55+DDD+número; múltiplos separados por |.';
comment on column public.responsaveis_unidades.telefone_outros is 'Contatos originais sem classificação segura, preservados para revisão.';

with partes as (
  select r.id, btrim(p.raw) as raw, p.ord,
    regexp_replace(btrim(p.raw), '[^0-9]', '', 'g') as digits
  from public.responsaveis_unidades r
  cross join lateral regexp_split_to_table(coalesce(r.telefone, ''), '[|;/,\r\n]+') with ordinality as p(raw, ord)
  where btrim(p.raw) <> ''
), candidatos as (
  select *, case
    when raw !~ '^(\+[[:space:]]*)?[0-9[:space:]().-]+$' then null
    when raw ~ '^[0-9]+\.[0-9]+$' and raw !~ '^[0-9]{4,9}\.[0-9]{4}$' then null
    when raw ~ '^\+' and digits !~ '^55[0-9]{10,11}$' then null
    when digits ~ '^[0-9]{10,11}$' then '55' || digits
    when digits ~ '^55[0-9]{10,11}$' then digits
    when digits ~ '^0[0-9]{10,11}$' then '55' || substr(digits, 2)
    when digits ~ '^0055[0-9]{10,11}$' then substr(digits, 3)
    else null end as candidato
  from partes
), classificados as (
  select *, case when candidato ~ '^55(11|12|13|14|15|16|17|18|19|21|22|24|27|28|31|32|33|34|35|37|38|41|42|43|44|45|46|47|48|49|51|53|54|55|61|62|63|64|65|66|67|68|69|71|73|74|75|77|79|81|82|83|84|85|86|87|88|89|91|92|93|94|95|96|97|98|99)(9[0-9]{8}|[2-5][0-9]{7})$' then candidato end as numero
  from candidatos
), unicos as (
  select id, coalesce(numero, raw) as valor,
    case when length(numero) = 13 then 'celular' when numero is not null then 'fixo' else 'outros' end as tipo,
    min(ord) as ord
  from classificados group by id, coalesce(numero, raw), numero
), contatos as (
  select id,
    string_agg(valor, ' | ' order by ord) filter(where tipo = 'celular') as celular,
    string_agg(valor, ' | ' order by ord) filter(where tipo = 'fixo') as fixo,
    string_agg(valor, ' | ' order by ord) filter(where tipo = 'outros') as outros
  from unicos group by id
)
update public.responsaveis_unidades r set
  celular = coalesce(r.celular, c.celular),
  telefone_fixo = coalesce(r.telefone_fixo, c.fixo),
  telefone_outros = coalesce(r.telefone_outros, c.outros)
from contatos c where r.id = c.id;

notify pgrst, 'reload schema';
