begin;
set local lock_timeout = '2s';
set local statement_timeout = '30s';

-- Sincronizar a identidade e seu inventário na mesma transação. Não reescrever
-- cobranças, acordos ou parcelas, nem escolher um registro entre cópias legadas.
lock table public.cobrancas in share row exclusive mode nowait;
lock table public.cobrancas_recibo_guard in exclusive mode nowait;

create or replace function public.cobranca_recibo_identidade(observacao text)
returns text language sql immutable parallel safe set search_path = pg_catalog as $$
  select case when m[2] ~ '[0-9]' then replace(upper(m[2]), '.', '') end
  from (select regexp_match(observacao,
    '\yrecibo(?:\s*:\s*|\s+)(?:(AE|AJ|J|A|D|B|P)\s+)?([a-z0-9][a-z0-9._/-]*)(?=\s|\||$)', 'i') m) s;
$$;

-- A função immutable participa deste índice: suas chaves também precisam ser
-- recalculadas, ou a consulta indexada continuaria usando os recibos com ponto.
do $reindex$
begin
  if to_regclass('public.easy_cap_identidade_recibo_idx') is not null then
    reindex index public.easy_cap_identidade_recibo_idx;
  end if;
end $reindex$;

-- A chave antiga com ponto não pode permanecer separada da chave normalizada:
-- os triggers precisam contar o mesmo conjunto que a função passa a reconhecer.
delete from public.cobrancas_recibo_guard;
insert into public.cobrancas_recibo_guard(unidade_id, recibo, registros)
select unidade_id, public.cobranca_recibo_identidade(observacoes), count(*)
from public.cobrancas
where unidade_id is not null and public.cobranca_recibo_identidade(observacoes) is not null
group by unidade_id, public.cobranca_recibo_identidade(observacoes);

commit;
