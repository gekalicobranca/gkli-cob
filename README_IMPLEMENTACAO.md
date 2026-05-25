# GKLI Cobrança — edição de carteiras

Pacote incremental para sobrescrever no projeto.

## Arquivos incluídos

- `features/carteiras/actions.ts`
  - adiciona `updateCarteira`
  - mantém proteção `requireAdmin`
  - valida duplicidade por `nome_normalizado`, ignorando a própria carteira com `.neq('id', id)`
  - atualiza `updated_at`

- `features/carteiras/queries.ts`
  - adiciona `getCarteiraByIdForAdmin(id)`

- `app/app/carteiras-usuarios/page.tsx`
  - adiciona botão `Editar` na listagem de carteiras

- `app/app/carteiras-usuarios/[id]/editar/page.tsx`
  - nova tela de edição de carteira

## Rota nova

`/app/carteiras-usuarios/[id]/editar`

## Banco de dados

Não exige SQL novo. Usa as colunas já existentes:

- `id`
- `nome`
- `nome_normalizado`
- `descricao`
- `logo_url`
- `ativo`
- `created_at`
- `updated_at`
