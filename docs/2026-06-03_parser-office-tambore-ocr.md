# Parser Office Tamboré OCR · Cobranças

## Origem

- Relatório: Devedores Detalhado
- Condomínio: 5987 - Subcondomínio Edifício Office Tamboré
- Formato: PDF digitalizado/comprimido com OCR imperfeito

## Estratégia

O parser não importa linhas de verba isoladas. Ele reconstrói a cobrança por recibo:

- unidade atual do bloco OCR;
- recibo;
- acordo, quando presente;
- vencimento;
- valor importável pela coluna **VALOR RECIBO**.

As verbas como condomínio, fundo de reserva, coleta de lixo, TAG e manutenções são ignoradas como linhas individuais.

## Resultado esperado no arquivo validado

- 27 unidades no resumo do empreendimento;
- 140 recibos no resumo do empreendimento;
- total original/valor recibo de conferência: R$ 130.185,42;
- total corrigido de conferência: R$ 186.645,12.

## Observações

O OCR pode distorcer identificações de unidade e datas. O parser normaliza casos comuns como `18/85/2026` para `10/05/2026` e remove zeros à esquerda da unidade.
