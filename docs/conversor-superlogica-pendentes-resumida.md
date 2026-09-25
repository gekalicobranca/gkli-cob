# Superlógica — Relação Resumida de Pendentes

Padrão `superlogica-pendentes-resumida-cobrancas-v1`, categoria cobranças. Referência visual: relatório Legus do Condomínio Domo Residencial Life (1054). Reconhece o título, colunas Bloco/Unidade/Nome/Recibo/Vencto./Emissão/Valor/Total e totalizador de unidades. Não depende do nome do arquivo ou condomínio.

## Leitura e saída

- Extrai texto por posição visual para separar bloco, unidade, responsável, número do recibo, marcador e valores, que vêm colados na ordem do fluxo PDF.
- Uma cobrança por recibo. A coluna Valor é o valor daquele recibo; Total é o subtotal da unidade, presente na última linha. Não soma subtotais como novas cobranças.
- Mantém contexto de unidade e soma acumulada nas páginas seguintes. Cabeçalhos repetidos não criam duplicidades. Confere subtotais de cada unidade, quantidade de unidades e total geral antes de aplicar filtros.
- Preserva blocos/unidades alfanuméricos e zeros à esquerda (incluindo 0/00DOMO, LOC/00CARR e VG/VG1558).
- Marcadores A, AE, AJ, J, D, B e P são mapeados por recibo. Uma linha sem marcador é normal, mesmo se a linha anterior estiver em acordo ou jurídico.
- O relatório não discrimina principal e encargos: Valor é exportado nas colunas de valor original/atualizado e total do recibo; juros, multa e correção não são inferidos. Essa limitação e o conteúdo da coluna Emissão são preservados nas observações.
- CNPJ vem da seleção operacional; CPF/CNPJ pessoal e contatos ausentes permanecem vazios.
- Mantém a regra existente de recorte operacional por ano corrente. O histórico completo fica disponível para o ranking mensal e é usado na reconciliação do documento.

## Conferência do arquivo de referência

Emitido em 18/09/2026, período até 31/07/2026. Contém 302 recibos, 47 unidades e R$ 334.208,27. No recorte de 2026, exporta 116 recibos em 40 unidades, totalizando R$ 154.115,56. Os 186 recibos de outros anos não integram a planilha operacional. O PDF não informa o CNPJ do condomínio.

## Validação

`node node_modules/tsx/dist/cli.mjs scripts/validate-conversao-superlogica-resumida.ts`

Passe o caminho do PDF como primeiro argumento para testar também o documento real. Os testes cobrem continuação entre páginas, marcadores por linha, identificadores, datas inválidas, subtotais, total geral, duplicidades e saída XLSX com recorte anual. Dados pessoais do documento não são incorporados ao repositório.
