-- Permite unidades distintas com o mesmo numero quando o bloco/tipo for diferente.
--
-- Exemplo real:
--   OR/000014 = unidade ordinaria
--   VE/000014 = vaga de estacionamento
--
-- A restricao antiga public.unidades(condominio_id, identificacao) impede esse
-- modelo e causa erro na importacao de inadimplencia.

alter table public.unidades
  drop constraint if exists unidades_condominio_identificacao_key;

drop index if exists public.unidades_condominio_identificacao_key;

create unique index if not exists unidades_condominio_bloco_identificacao_unq
  on public.unidades (
    condominio_id,
    lower(trim(coalesce(bloco, ''))),
    lower(trim(identificacao))
  );
