# Parser Office Tamboré · Cobranças XLS/XLSX

## Objetivo

Converter a exportação XLS/XLSX do relatório **Devedores Detalhado** do Office Tamboré em planilha oficial de importação de cobranças do GKLI.

## Layout reconhecido

- Aba com título `OFFICE`.
- Cabeçalho de unidade com número da unidade e texto `PROPRIETÁRIO:` / `INQUILINO:`.
- Linhas de recibo com colunas:
  - Recibo;
  - Cobrança;
  - Acordo;
  - Vencimento;
  - Histórico;
  - Vl. Verba;
  - Vl. Recibo;
  - Vl. Corrigido Recibo.

## Regra operacional

- 1 recibo = 1 cobrança.
- Valor importável = `Vl. Recibo`.
- As linhas de composição/verba são ignoradas.
- Quando houver número de acordo, ele é preservado em `marcador_origem` e observações.
- Responsável é extraído preferencialmente do campo `PROPRIETÁRIO:`.

## Teste com RelatorioDevedores.xls.xlsx

Resultado esperado pela própria planilha:

- 25 unidades;
- 138 recibos;
- total importável: R$ 128.071,66.
