drop index if exists public.responsaveis_unidades_unq;

create unique index if not exists responsaveis_unidades_unq
  on public.responsaveis_unidades (
    condominio_id,
    lower(trim(coalesce(bloco, ''))),
    lower(trim(unidade)),
    tipo_responsavel
  );
