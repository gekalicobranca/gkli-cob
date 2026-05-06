# GKLI UI System v1 — gkli-cob

## Diretriz principal
Todos os módulos usam a cor institucional do produto como base visual. Não há cor própria por módulo.

## Cabeçalho de páginas
- Componente único: `components/ui/page-header.tsx`.
- Fundo: `var(--gkli-primary)`.
- Título, subtítulo e eyebrow em branco.
- Ações no header recebem tratamento automático via CSS para manter contraste.

## Botões
- Primário: fundo institucional, texto branco.
- Secundário: branco, texto institucional, borda institucional.
- Ghost: transparente, texto institucional.
- Danger: reservado apenas para ações destrutivas ou críticas.

## Menu lateral
- Header institucional com alto contraste.
- Item ativo com fundo claro institucional e barra lateral.
- Sem contadores no menu.

## Listas e filtros
- Classes globais preparadas:
  - `gkli-list-shell`
  - `gkli-filter-bar`
  - `gkli-row-hover`

Essas classes devem ser usadas como padrão nas próximas telas/refatorações.
