# GKLI Cobrança — Build Fix v7

Correção aplicada após erro de `next build` em `features/acordos/queries.ts`.

## Erro corrigido

O build falhava porque o helper `applyCarteiraScope` tentava preservar os tipos internos do Supabase. O Supabase altera o tipo do builder em cada encadeamento (`select`, `eq`, `in`, `maybeSingle`), e isso fazia o TypeScript recusar atribuições como:

```ts
query = applyCarteiraScope(query, scope.carteiraIds)
```

## Arquivo alterado

```txt
utils/auth/apply-carteira-scope.ts
```

## Estratégia

O helper agora recebe e retorna `any`, mantendo o filtro real em runtime:

- admin: sem filtro de carteira;
- usuário sem carteiras: força UUID vazio;
- usuário com carteiras: aplica `.in(column, carteiraIds)`.

## Por que é seguro

A mudança não altera regra de negócio nem SQL gerado. Apenas evita que os tipos internos do Supabase quebrem o build.

## Comando recomendado

```bash
rm -rf .next
npm run build
```
