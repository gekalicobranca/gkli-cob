# Remoção de cobranças ausentes na importação

Decisão de 19/11/2026: ao concluir uma importação de cobranças, remover as cobranças abertas ausentes no relatório, desde que não tenham vínculo com acordo nem situação judicial. Implementação local; esta etapa não aplicou migration, não publicou e não removeu dados em produção.

## Fluxo e escopo

A confirmação em lotes resolve novamente as unidades, conclui todas as linhas e chama `removerCobrancasAusentesDaImportacao`. A RPC revalida a carteira e os condomínios do arquivo, a quantidade de itens e o progresso persistido. A limpeza acontece antes dos alertas e das pendências de ausência. O resultado registra `cobrancas_ausentes_removidas` e `resumo.limpeza_ausentes`.

Essa limpeza de ausentes independe da opção de substituir a carga anterior. Ela não executa durante cada lote nem reprocessa importações já confirmadas.

O arquivo deve ter recorte `todos`, todas as linhas válidas e todos os lotes processados, sem falhas ou divergências. Arquivos explicitamente parciais/incompletos não autorizam remoção. Avisos de cobrança equivalente já existente não são falhas de importação. A presença é apurada por condomínio, carteira, unidade e identidade do recibo; AE/J não alteram a identidade. Sem identidade de recibo em um dos lados, usa-se o vencimento. A chave histórica Lello preservada após inclusão do número do portal também é reconhecida.

## Preservações

- Qualquer vínculo em `acordos.cobranca_id` ou `acordo_cobrancas`, inclusive histórico, independentemente do status do acordo.
- Situação `judicializado` no status operacional ou legado, ou unidade marcada com ação judicial. Marcadores AE/J da administradora não determinam essa situação.
- Cobranças quitadas, pagas, canceladas ou baixadas; referências em `fechamento_pagamentos`.
- Cobranças arquivadas/duplicadas, canônicos com duplicatas vinculadas, outras carteiras/condomínios e registros criados depois da prévia.

## Integridade e retomada

As RPCs são `SECURITY INVOKER`, com execução restrita a `service_role`. A ação verifica papel e carteira antes de usar o cliente administrativo. O banco bloqueia a importação, os condomínios e as cobranças enquanto verifica vínculos e remove os elegíveis. A sobrecarga com `p_unidades` persiste os IDs resolvidos pelo servidor nos itens, evitando apagar uma cobrança presente por causa de um ID obsoleto na prévia.

A transação cancela mensagens pendentes e continuidades dos Flows, atualiza seus vínculos e contadores e resolve pendências de ausência, sem presumir pagamento. Mensagens enviadas, interações e histórico de saneamento são preservados por desvinculação. A auditoria inclui snapshot das cobranças e dependências antes da exclusão. Erro de FK ou auditoria reverte toda a transação.

`resumo.limpeza_ausentes` é gravado na mesma transação e conservado pela finalização: uma retomada devolve o resultado anterior, sem apagar dados adicionais. A remoção é física; recuperação depende dos snapshots da auditoria, recomposição dos vínculos e conferência operacional, não de uma reimportação automática.

## Arquivos e validação

- `features/importacoes/actions.ts` e `features/importacoes/remover-ausentes.ts`.
- `supabase/migrations/20261119204211_importacao_ausentes_preservar_acordos_judicializadas.sql`.
- `scripts/validate-importacao-ausentes-regra.ts`: banco Postgres isolado com PGlite; remoção, proteções, identidade, unidades resolvidas, falha de auditoria, histórico e idempotência.
- `scripts/validate-importacao-lotes.ts`: integração da conclusão; nenhuma remoção antes de terminar os lotes e alertas somente após a limpeza.

Comando de regressão: `node node_modules/tsx/dist/cli.mjs --test scripts/validate-importacao-ausentes-regra.ts scripts/validate-importacao-lotes.ts scripts/validate-importacao-ausentes.ts scripts/validate-importacao-recibo-ae.ts scripts/validate-conciliacao-recibos.ts` (22 testes aprovados).

`npm run typecheck` e `git diff --check` aprovados. Lint de `actions.ts` e `remover-ausentes.ts` sem erros; sete avisos existentes de funções/parâmetros não usados em `actions.ts`. As permissões da RPC foram verificadas no banco isolado: execução negada a `anon`/`authenticated` e concedida a `service_role`.

Pendente: aplicar a migration antes de publicar a aplicação no ambiente autorizado. Importações anteriores não são modificadas automaticamente. Os fluxos próprios de conversão PDF e Maestro mantêm suas rotinas existentes.
