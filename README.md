# GKLI Cobrança — Atualização dos cards laterais do conversor

Pacote incremental para substituir:

features/conversao-relatorio/components/recognized-templates-card.tsx

Atualiza o card lateral de layouts reconhecidos com os modelos já desenvolvidos/homologados:

## Unidades
- Superlógica · Unidades
- Hflex / LiveFacilities · Unidades

## Cobranças
- Superlógica · Cobranças
- Hflex / LiveFacilities · Cobranças
- CondoPro / BBZ · Cobranças
- Slaviero · Cobranças
- Safira · Cobranças
- Lello · Cobranças
- Conectcon · Cobranças

Também reforça no texto do card que a saída sempre deve ser a planilha oficial de Importações GKLI.

## Observação de validação

Foi tentado `npx tsc --noEmit`, mas o ambiente local deste pacote não possui dependências instaladas/resolvidas (`next`, `react`, `@types/node`, `xlsx`, etc.). A falha não foi causada por este arquivo específico; é uma limitação do ambiente de teste atual.
