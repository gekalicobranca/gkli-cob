-- U2.1 — Busca Operacional Global GKLI Cobrança
-- Objetivo: preparar uma camada performática para busca operacional global.
-- A interface já funciona com a API server-side atual. Este SQL cria a fundação
-- para evoluir a busca para índice unificado, FTS e trigram similarity.

create extension if not exists unaccent;
create extension if not exists pg_trgm;

create table if not exists public.operacional_search_index (
  id uuid primary key default gen_random_uuid(),
  entidade_tipo text not null check (entidade_tipo in ('condominio', 'unidade', 'cobranca', 'acordo', 'timeline', 'template', 'regua', 'lote')),
  entidade_id uuid not null,
  carteira_id uuid null,
  titulo text not null,
  subtitulo text null,
  status text null,
  href text not null,
  texto_busca text not null,
  texto_busca_normalizado text not null default '',
  texto_busca_tsv tsvector not null default ''::tsvector,
  peso integer not null default 100,
  atualizado_em timestamptz not null default now(),
  unique (entidade_tipo, entidade_id)
);

create or replace function public.gkli_operacional_search_index_prepare()
returns trigger
language plpgsql
as $$
begin
  new.texto_busca_normalizado := lower(unaccent(coalesce(new.texto_busca, '')));
  new.texto_busca_tsv := to_tsvector('portuguese', lower(unaccent(coalesce(new.texto_busca, ''))));
  new.atualizado_em := coalesce(new.atualizado_em, now());
  return new;
end;
$$;

drop trigger if exists trg_gkli_operacional_search_index_prepare on public.operacional_search_index;
create trigger trg_gkli_operacional_search_index_prepare
before insert or update of texto_busca, titulo, subtitulo, status
on public.operacional_search_index
for each row
execute function public.gkli_operacional_search_index_prepare();

create index if not exists operacional_search_index_carteira_idx
  on public.operacional_search_index (carteira_id);

create index if not exists operacional_search_index_tipo_idx
  on public.operacional_search_index (entidade_tipo);

create index if not exists operacional_search_index_tsv_idx
  on public.operacional_search_index using gin (texto_busca_tsv);

create index if not exists operacional_search_index_trgm_idx
  on public.operacional_search_index using gin (texto_busca_normalizado gin_trgm_ops);

create or replace function public.gkli_busca_operacional(
  p_termo text,
  p_carteira_ids uuid[] default null,
  p_limite integer default 24
)
returns table (
  entidade_tipo text,
  entidade_id uuid,
  carteira_id uuid,
  titulo text,
  subtitulo text,
  status text,
  href text,
  score numeric
)
language sql
stable
as $$
  with termo as (
    select
      trim(coalesce(p_termo, '')) as raw,
      lower(unaccent(trim(coalesce(p_termo, '')))) as normalizado,
      plainto_tsquery('portuguese', lower(unaccent(trim(coalesce(p_termo, ''))))) as tsq
  )
  select
    i.entidade_tipo,
    i.entidade_id,
    i.carteira_id,
    i.titulo,
    i.subtitulo,
    i.status,
    i.href,
    (
      coalesce(ts_rank(i.texto_busca_tsv, termo.tsq), 0) * 100
      + coalesce(similarity(i.texto_busca_normalizado, termo.normalizado), 0) * 30
      + i.peso
    )::numeric as score
  from public.operacional_search_index i
  cross join termo
  where length(termo.raw) >= 2
    and (p_carteira_ids is null or i.carteira_id = any(p_carteira_ids) or i.carteira_id is null)
    and (
      i.texto_busca_tsv @@ termo.tsq
      or i.texto_busca_normalizado ilike '%' || termo.normalizado || '%'
      or similarity(i.texto_busca_normalizado, termo.normalizado) > 0.18
    )
  order by score desc, i.atualizado_em desc
  limit greatest(1, least(coalesce(p_limite, 24), 50));
$$;

comment on table public.operacional_search_index is 'Índice unificado para busca operacional global do GKLI Cobrança.';
comment on function public.gkli_busca_operacional(text, uuid[], integer) is 'Busca operacional global com FTS, unaccent e trigram similarity.';
