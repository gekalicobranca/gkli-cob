# BRCondos — Relatório de Contas a Receber

- Padrão: `brcondos-contas-receber-cobrancas-v1`, categoria `cobrancas`.
- Reconhece o título, rodapé BRCondos, cabeçalho da tabela e totalizadores. O condomínio vem do título; não depende do nome do arquivo.
- Uma fatura gera uma cobrança. Faturas distintas da mesma unidade são preservadas. O número da fatura identifica o recibo; o campo Documento da tabela é documento de cobrança, não CPF.
- Extrai unidade (preservando zeros), responsável, CPF/CNPJ entre parênteses, vencimento, principal, juros, multa, correção e desconto. CPF quebrado em duas linhas é recomposto.
- Valor atualizado = principal + juros + multa + correção - desconto, inclusive quando fica abaixo do principal. Os totalizadores e a quantidade de faturas/unidades devem coincidir antes da exportação.
- Grupo ACORDO/NEGOCIAÇÃO gera marcador `A` e situação `acordo`. Emissão/Competência, situação de vencimento, documento de cobrança e observação original ficam nas observações. Competência da importação segue a convenção existente, derivada do vencimento.
- Mantém continuação de observações entre páginas e remove cabeçalhos repetidos. Referências antigas nas observações não criam novas cobranças.
- Escopo homologado: títulos da carteira Receber sem pagamento, com Nosso Número vazio (`-`), unidade no formato `UNIDADE, N°`, CPF/CNPJ identificado e status A VENCER ou VENCIDO. Outros layouts ou títulos com pagamentos/negociação já registrada são bloqueados com mensagem, sem exportação parcial.
- O recorte operacional existente por ano de vencimento continua aplicado depois da reconciliação completa. CNPJ do condomínio vem da seleção operacional.

O PDF de referência Vila Bella Vista, emitido em 22/09/2026, contém quatro faturas de acordo em duas unidades, totalizando R$ 6.921,97, todas marcadas A VENCER na origem. Não representa exclusivamente débitos vencidos.

## Validação

```powershell
node node_modules/tsx/dist/cli.mjs scripts/validate-conversao-brcondos-cobrancas.ts
```

Para validar também o PDF real, passe seu caminho como primeiro argumento. Os testes usam dados fictícios para validar descontos, divergências de totais, pagamentos, datas inválidas, continuação entre páginas e o XLSX exportado. O PDF e os dados pessoais não integram o repositório.
