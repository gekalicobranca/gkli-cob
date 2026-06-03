# Parser Moema Flat · Slaviero

Implementação do padrão de cobranças para o relatório PDF `Inadimplentes` da Slaviero Condomínios usado pelo Edifício Moema Flat Service.

## Arquivos alterados

- `features/conversao-relatorio/server/parse-relatorio-buffer.ts`
- `features/conversao-relatorio/components/recognized-templates-card.tsx`

## Regras

- Detecta o cabeçalho `W003A Edifício Moema Flat Service (SESM)`.
- Usa o layout Slaviero como base.
- Gera uma cobrança por linha de vencimento/competência.
- Usa `Principal` como valor original.
- Preserva `Total` como valor atualizado.
- Marca cabeçalho com `Jurídico` como situação de origem `juridico`.
- Suporta unidade textual `REST-LEMON`.

## Validação rápida

No PDF analisado, o relatório informa 17 unidades inadimplentes. A leitura tabular com o parser reconhece as linhas de cobrança do layout Slaviero/Moema Flat, incluindo débitos históricos e recentes.
