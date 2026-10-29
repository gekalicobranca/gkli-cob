# Custo de emissão de boleto

O cadastro do condomínio define `custo_emissao_boleto`, em reais, com zero como padrão. Solar dos Bandeirantes: R$ 4,80, cadastrado e auditado em 29/10/2026.

A emissão é acrescentada a cada boleto de um novo acordo, inclusive à entrada. A entrada informada no simulador é a amortização sem emissão; o resumo e o boleto mostram a entrada acrescida do custo. Uma quitação integral na entrada gera somente um custo. Crédito integral sem pagamento não gera custo. Honorários e juros Price são calculados antes da emissão.

O servidor consulta o valor no condomínio. Os itens recebem rateio em centavos; o total fecha com entrada e parcelas. O custo contratado fica registrado nas observações e na auditoria. Acordos existentes não são recalculados.

Validação: scripts/validate-custo-boleto.ts e scripts/validate-cota-mes.ts (23 verificações, incluindo propostas dos agentes).
