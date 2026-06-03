# Parser Cipó · Cobranças OCR XLSX

## Objetivo

Converter o XLSX gerado por OCR a partir de PDF digitalizado da Torre Cipó em planilha oficial de Importações/Cobranças do GKLI.

## Padrão reconhecido

- Abas `Table 1`, `Table 2`, etc.
- Cabeçalho de unidade no formato `CIPÓ 000054`.
- Linhas de recibo com recibo, acordo, vencimento e valor.
- Linhas de composição abaixo do recibo, que devem ser ignoradas.
- Linhas de resumo da unidade/bloco usadas apenas como conferência.

## Regra de conversão

- 1 linha de recibo = 1 cobrança.
- Unidade é normalizada sem zeros à esquerda.
- Bloco é preenchido como `CIPÓ`.
- Valor original = valor da linha do recibo.
- Multa, correção e juros ficam zerados, porque o XLSX OCR só preserva o valor consolidado do recibo.
- Número de acordo, quando presente, é preservado como marcador/origem.

## Teste com Cond. Cipó.xlsx

- Unidades detectadas: 14
- Recibos/cobranças gerados: 120
- Valor total importável: R$ 225.112,30

## Observação operacional

Esse parser não substitui OCR nativo de PDF. Ele aceita especificamente o XLSX resultante da conversão externa de PDF digitalizado para Excel.
