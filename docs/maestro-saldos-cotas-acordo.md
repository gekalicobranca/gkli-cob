# Atualização de saldos das cotas identificadas como acordo

## Regra

Na captação Maestro/Easy Maestro, uma linha explicitamente identificada pelo parser como `situacaoOrigem=acordo` pode trazer principal residual diferente do principal original da cobrança. Essa diferença, isoladamente, não deve bloquear o relatório inteiro nem exigir a resolução de um vínculo de acordo.

O confirmador passa a situação da origem ao conciliador. Para recibo explícito idêntico, marcadores compatíveis, mesma carteira, condomínio, unidade e vencimento, competência compatível, saldo positivo e registro aberto não arquivado, o conciliador retorna a atualização existente por ID e revisão. Continua recusando identidade ambígua, recibo diferente, divergência de vencimento/competência, estado pago/quitado/cancelado e valor inválido.

Não se infere quitação nem se cria, corrige ou remove vínculo de acordo. A regra vale também quando a cota não tem vínculo, como no caso da unidade 1001 do Rio Negro. Não depende de nome ou ID desse condomínio.

## Campos preservados

A rota encaminha somente o saldo atualizado e encargos para a RPC transacional já existente. Não encaminha o principal residual como substituto de `cobrancas.valor_original`. Preserva estado operacional/financeiro, bloqueios, acordos, `acordo_cobrancas` e `parcelas_acordo`, inclusive valor e vencimento das parcelas de acordo. A sincronização já existente da linha de origem em `cobranca_parcelas` é representação da cota, não do cronograma do acordo.

Arquivos: `features/importacoes/cobrancas-conciliacao.ts` e `app/api/conversao-relatorio/confirmar/route.ts`. Não há migração adicional para esta regra: a RPC já restringe os campos gravados e audita antes/depois.

## Verificação

`scripts/validate-conciliacao-recibos.ts` cobre os quatro padrões de saldo/principal observados no Rio Negro (113, 117, 1001 e 1117), sem depender de vínculo, e as guardas de identidade, duplicidade, valor e estado. `scripts/validate-maestro-substituicao.ts` exercita a RPC com principal residual divergente, com e sem vínculo, conferindo por snapshot que acordos, parcelas e vínculos não mudam e que o principal original é preservado.

Resultado: 14 testes da conciliação de recibos e três da substituição aprovados. Verificação TypeScript `tsc --noEmit --pretty false --incremental false` concluída sem erros; `git diff --check` sem avisos. As verificações foram locais, sem conexão com produção.

A publicação desta alteração da aplicação web não exige nova migração, não retoma captações e não atualiza dados financeiros por si. Não executar captação nem alterar cobranças/acordos reais para testar a publicação. A correção anterior de mensagens antigas é independente desta entrega.
