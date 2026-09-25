# Superlógica analítica — validação Square Garden Studios

O PDF `09-2026.pdf` utiliza o padrão existente `superlogica-pendentes-cobrancas-v1`. A base identifica o condomínio como CONDOMÍNIO SQUARE GARDEN CAMPO BELO STUDIOS, ativo, administradora Manager, CNPJ 52.151.457/0003-62.

## Ajustes no padrão existente

- Reconhece marcadores de recibo que o extrator coloca depois do último valor da linha (`...534,37AE`), além dos marcadores antes do vencimento. Uma linha sem marcador não herda o marcador de outro recibo.
- Preserva recibos que continuam na página seguinte, com ou sem repetição de número e vencimento, sem duplicar a cobrança.
- Captura CPF/CNPJ no cabeçalho da unidade. Agenda do cliente tem prioridade nos campos principais de telefone/e-mail; agenda da unidade e contatos adicionais ficam nas observações, preservando indicações de inquilino. Contatos após o total ou na página seguinte são associados a todos os recibos daquela unidade.
- Confere principal, multa, correção, juros e total contra os totais declarados por unidade e no relatório, quando presentes. Também confere quantidade de unidades. Divergências bloqueiam a exportação.

## Resultado da referência

28 recibos em 15 unidades, todos com vencimento em 2026. Principal R$ 20.043,84; multa R$ 400,91; atualização R$ 34,70; juros R$ 257,80; total R$ 20.737,25. Há 6 recibos AE (acordo extrajudicial), 9 J (jurídico) e 13 sem marcador. Os 28 registros têm documento pessoal, telefone e e-mail extraídos do PDF.

## Teste

`node node_modules/tsx/dist/cli.mjs scripts/validate-conversao-superlogica-analitica.ts`

Opcionalmente passe o caminho do PDF para conferir também a extração e a saída XLSX reais. Dados pessoais do documento não integram o teste versionado.
