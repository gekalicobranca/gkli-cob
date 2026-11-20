# Sprint 1 do Review — parser e relatórios

Publicação preparada em 20/11/2026 sobre a main `8a19556f`. O checkout do Review (`gkli-cob-main`, branch `codex/sprint-3-query-performance`) tem trabalho paralelo, incluindo início da Sprint 2. Seus arquivos, branch local e alterações pendentes foram preservados. A publicação foi preparada em worktree isolado com HEAD destacado e usará a branch remota já existente, por avanço normal, sem criar branch ou force push.

## Escopo

- Parser Superlógica Inadimplência Zero acumula total por chave bloco/unidade em Map, sem reexaminar todos os recibos anteriores ao validar cada subtotal. Mantém a acumulação quando a mesma unidade reaparece, a tolerância e as recusas por divergência de totais.
- Excel e PDF executivo combinam a hierarquia e a ordenação escolhida em um único sort estável. Os comparadores, desempates e filtros existentes permanecem como referência.
- Excel agrupado atualiza vencimentos mínimo/máximo por comparação direta, sem criar e ordenar arrays por cobrança.

Arquivos: `features/conversao-relatorio/server/parse-relatorio-buffer.ts`, `features/cobrancas/ordem-relatorio.ts`, `features/cobrancas/queries.ts` (somente exportação do comparador), `features/cobrancas/exportacao-excel.ts`, `app/api/cobrancas/relatorio-executivo/route.ts` e dois validadores.

Nenhuma migration ou alteração de consulta, carteira, RLS, status, valor financeiro ou rotina operacional faz parte desta entrega. Alterações preexistentes em telas, unidades, modelos reconhecidos, CNPJ e expectativas de layout de Acordos não foram incluídas.

## Validação da candidata de publicação

Passaram `node --no-wasm-tier-up node_modules/tsx/dist/cli.mjs scripts/validate-conversao-superlogica-analitica.ts` e o comando equivalente para `scripts/validate-exportacoes-excel.ts`. Casos incluem totais por unidade/relatório, unidade repetida, 2.000 unidades sintéticas, equivalência de ordenação e limites de vencimentos agrupados. As expectativas de Acordos do validador foram mantidas conforme a main, porque o outro layout pertence a alteração paralela.

ESLint nos sete arquivos: zero erros, três avisos existentes de variáveis não usadas no parser. `git diff --check` passou. TypeScript e build serão exigidos no check quality do PR antes do merge, junto ao Preview Vercel. As validações são sintéticas/locais e não medem SLA em produção.

## Publicação

Fluxo GitHub → PR → quality e Preview aprovados → merge → Vercel Production READY e alias no mesmo SHA da main. Registrar os identificadores e o resultado final no PR. Smoke de produção somente em leitura; não importar dados reais ou criar operações financeiras para testar. A Sprint 2 permanece no chat Review para continuidade própria.
