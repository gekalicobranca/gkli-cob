# GKLI Cobrança — Revisão de Build

## Rodada aplicada

Esta versão corrige o problema principal identificado na validação TypeScript: os joins do Supabase podem retornar relação como objeto, array ou null, enquanto as páginas consomem como objeto.

## Correções realizadas

- Criado `utils/supabase/normalize-relation.ts`.
- Aplicada normalização nos retornos de queries com joins:
  - `features/cobrancas/queries.ts`
  - `features/acordos/queries.ts`
  - `features/unidades/queries.ts`
  - `features/condominios/queries.ts`
  - `features/carteiras/queries.ts`
  - `features/importacoes/queries.ts`
  - `features/cockpit/queries.ts`
- Ajustado `utils/auth/apply-carteira-scope.ts` para manter o tipo da query ao aplicar `.in()`.
- Fixado TypeScript em `5.9.3` no `package.json` para evitar incompatibilidades com TypeScript 6.
- Mantido foco apenas no GKLI Cobrança. CRM não foi alterado.

## Observação de validação

No ambiente desta sessão, a instalação completa não concluiu por falha do registry interno ao baixar pacote opcional do Tailwind (`@tailwindcss/oxide-wasm32-wasi`). Por isso, o `next build` completo deve ser rodado no ambiente local/Vercel.

## Comandos recomendados

```bash
rm -rf .next node_modules
npm install
npm run build
npm run dev
```

Se quiser usar lock estrito:

```bash
npm install
npm run build
```

Evite `npm ci` nesta rodada se o lockfile ainda estiver divergente após o ajuste de TypeScript; rode `npm install` para regenerar o lock local.
