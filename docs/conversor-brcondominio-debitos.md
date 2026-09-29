# BRCondomínio · Lista de Débitos

Padrão: `brcondominio-lista-debitos-cobrancas-v1`, independente do padrão BRCondos.
Reconhece o título Lista de Débitos, as colunas de pagamento/vencimento e o rodapé
BRCondomínio - Portal de Automação de Condomínios. O nome do condomínio vem do
cabeçalho; não é uma condição para reconhecer o fornecedor.

## Mapeamento

- Uma cobrança por título, preservando o identificador integral da unidade
  (ex.: `H0406`, `S1602`). O relatório não informa bloco separado nem responsável;
  esses campos ficam vazios.
- Nº Título vira recibo; Dt. Venc. vira vencimento.
- Valor, correção, multa, juros, honorários e devido são preservados no preview.
- Descrições continuam entre páginas, sem incorporar cabeçalhos e rodapés.
- A primeira referência textual de mês/ano da descrição vira competência.
  Na ausência dessa referência, a exportação usa o mês do vencimento, conforme
  a regra existente do motor.
- O critério explícito `Unidades encaminhadas ao Depto. Jurídico` marca as cobranças
  como origem jurídica. Critérios diferentes entre páginas são rejeitados.
- CSV/XLSX usa o formato oficial de Importações/Cobranças e o CNPJ selecionado.
  A exportação operacional continua limitada ao ano corrente do vencimento.

## Conferência e arredondamento

A extração visual usa tolerância vertical de 2 pontos apenas neste layout: datas,
valores e percentuais têm pequenas diferenças de alinhamento na mesma linha.
Os demais parsers mantêm a tolerância anterior.

Conferências: datas válidas, títulos únicos por unidade, quantidade por unidade e
geral, principal exato, composição dos títulos, seis totais por unidade e gerais,
e comparação do total geral com a soma dos subtotais declarados.

A composição admite até 3 centavos por título (cinco componentes e o total
arredondados). Nos acumulados, o limite é meio centavo por parcela somada mais
meio centavo pelo arredondamento do total. Toda diferença aceita é informada;
nenhum valor é ajustado para forçar igualdade. Divergências superiores ao limite
impedem a exportação. Relatórios truncados e layouts com pagamentos também são
rejeitados; este padrão cobre títulos sem pagamentos.

## Arquivo validado

`Debitos Condominiais em 24-09-2026.pdf`: 17 páginas, Edifício Airport Hotels.

- 220 títulos, 12 unidades; principal R$ 246.747,13.
- Soma dos valores devidos das linhas: R$ 397.445,16.
- Total geral impresso: R$ 397.445,19; diferença informada de R$ 0,03.
- 2026: 37 títulos, R$ 64.294,03.
- Título com vencimento em fevereiro de 2024 e competência textual de setembro
  de 2023 mantém a competência original. Descrições ausentes não são inventadas.

Teste: `npx tsx scripts/validate-conversao-brcondominio.ts`.
Para conferir também o PDF de referência, passe seu caminho como argumento.
O arquivo de referência não é incorporado ao repositório.
