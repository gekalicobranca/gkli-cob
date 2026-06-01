# U2.1 — Busca Operacional Global

## Objetivo

Transformar a busca do topo em uma barra operacional global, sem duplicar UX com outra experiência separada de `Ctrl+K`.

## O que foi implementado

- Campo de busca global no header principal.
- O botão de Configurações foi preservado como único elemento da direita.
- O antigo botão separado de Busca foi removido do header para evitar redundância.
- `Ctrl+K` apenas foca/abre a mesma busca global.
- Overlay com resultados agrupados por:
  - Condomínios
  - Unidades
  - Cobranças
  - Acordos
- Busca com debounce no frontend.
- API server-side dedicada em `/api/busca-global`.
- Histórico local de resultados recentes.
- Link discreto para busca completa em `/app/busca`.

## Arquitetura

A busca do header usa o componente:

`components/search/global-operational-search.tsx`

A API usa:

`app/api/busca-global/route.ts`

A base de consulta reutiliza:

`features/base-cadastral/queries.ts`

## Observação

O SQL da sprint cria uma camada preparatória de índice operacional com PostgreSQL `unaccent`, `pg_trgm` e função `gkli_busca_operacional`. A interface já funciona com a busca server-side atual e fica preparada para migração gradual para índice materializado/função otimizada.
