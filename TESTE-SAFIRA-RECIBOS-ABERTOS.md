# Teste — Safira · Relatórios de Recibos em Aberto

Arquivo de referência: `Cond. Safira.pdf`.

## Regra homologada

- 1 linha do relatório = 1 cobrança GKLI.
- Campo importável: **Valor do Recibo**.
- `valor_original` = Valor do Recibo.
- `valor_atualizado` = Valor do Recibo.
- `multa`, `correcao`, `juros`, `honorarios` e `custasProcessuais` são zerados na planilha de importação.
- O Valor Total e os encargos calculados pela origem são preservados em `observacoes`, apenas para conferência.

## Motivo

O GKLI recalcula multa, juros e correção internamente. Usar o Valor Total do relatório como valor importável duplicaria encargos.

## Exemplo validado

Linha de origem:

```txt
10/03/2026 3004021511 R$ 445,74 R$ 8,91 R$ 9,93 R$ 9,29 R$ 0,00 R$ 0,00 R$ 473,87
```

Saída esperada:

```txt
unidade: 111
vencimento: 2026-03-10
valor_original: 445,74
valor_atualizado: 445,74
observacoes: Valor total informado na origem: R$ 473,87 | Multa origem: R$ 8,91 | Correção origem: R$ 9,93 | Juros origem: R$ 9,29
```
