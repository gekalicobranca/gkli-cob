# Remoção de cobranças ausentes na importação

Decisão de 19/11/2026: ao concluir uma importação de cobranças, remover as cobranças abertas ausentes no relatório, desde que não tenham vínculo com acordo nem situação judicial. Publicação autorizada pelo usuário pelo PR #42, na branch já existente `codex/importacao-remover-ausentes`. Nenhum dado operacional foi removido durante a preparação/publicação.

## Fluxo e escopo

A confirmação em lotes resolve novamente as unidades, conclui todas as linhas e chama `removerCobrancasAusentesDaImportacao`. A RPC revalida a carteira e os condomínios do arquivo, a quantidade de itens e o progresso persistido. A limpeza acontece antes dos alertas e das pendências de ausência. O resultado registra `cobrancas_ausentes_removidas` e `resumo.limpeza_ausentes`.

Essa limpeza de ausentes independe da opção de substituir a carga anterior. Ela não executa durante cada lote nem reprocessa importações já confirmadas.

O arquivo deve ter recorte `todos`, todas as linhas válidas e todos os lotes processados, sem falhas ou divergências. Arquivos explicitamente parciais/incompletos não autorizam remoção. Avisos de cobrança equivalente já existente não são falhas de importação. A presença é apurada por condomínio, carteira, unidade e identidade do recibo; AE/J não alteram a identidade. Sem identidade de recibo em um dos lados, usa-se o vencimento. A chave histórica Lello preservada após inclusão do número do portal também é reconhecida.

## Preservações

A conferência de ausências em `features/importacoes/cobrancas-conciliacao.ts` descarta cobranças vinculadas a acordo por qualquer uma das duas relações, cobranças judicializadas no status operacional ou legado e cobranças de unidades com ação judicial. A ausência dessas cobranças não entra na contagem, nos alertas nem na criação de pendências.

- Qualquer vínculo em `acordos.cobranca_id` ou `acordo_cobrancas`, inclusive histórico, independentemente do status do acordo.
- Situação `judicializado` no status operacional ou legado, ou unidade marcada com ação judicial. Marcadores AE/J da administradora não determinam essa situação.
- Cobranças quitadas, pagas, canceladas ou baixadas; qualquer valor/data de pagamento, referências em `fechamento_pagamentos` e `scanner_baixas`, mesmo quando o status estiver desatualizado.
- Cobranças arquivadas/duplicadas, canônicos com duplicatas vinculadas, outras carteiras/condomínios e registros criados depois da prévia.

## Integridade e retomada

Na substituição inicial e na limpeza final, uma mensagem já cancelada que referencia uma cópia arquivada por duplicidade mantém seu histórico integral. A verificação usa a mesma regra do bloqueio de duplicidade e considera a cobrança direta, os IDs no conteúdo estruturado da mensagem e os itens do lote. Quando a mensagem tem uma FK direta para uma cobrança elegível, a limpeza preserva também essa cobrança para evitar a exclusão em cascata. Uma referência apenas no conteúdo histórico permite remover a cobrança elegível. A proteção de mensagens ativas continua valendo.

As RPCs são `SECURITY INVOKER`, com execução restrita a `service_role`. A ação verifica papel e carteira antes de usar o cliente administrativo. O banco bloqueia a importação, os condomínios e as cobranças enquanto verifica vínculos e remove os elegíveis. A sobrecarga com `p_unidades` persiste os IDs resolvidos pelo servidor nos itens, evitando apagar uma cobrança presente por causa de um ID obsoleto na prévia.

A transação cancela mensagens pendentes e continuidades dos Flows, atualiza seus vínculos e contadores e resolve pendências de ausência, sem presumir pagamento. Mensagens enviadas, interações e histórico de saneamento são preservados por desvinculação. A auditoria inclui snapshot das cobranças e dependências antes da exclusão. Erro de FK ou auditoria reverte toda a transação.

Antes de cancelar, bloqueia as mensagens em ordem estável e recusa a operação se houver mensagem/tentativa de e-mail em envio, envio WhatsApp reservado ou token/lease de progressão/montagem ativo. Nesse caso, aguardar o executor e conferir o resultado antes de retomar; não apagar reservas para liberar a importação. A publicação não executa essa rotina em registros reais.

`resumo.limpeza_ausentes` é gravado na mesma transação e conservado pela finalização: uma retomada devolve o resultado anterior, sem apagar dados adicionais. A remoção é física; recuperação depende dos snapshots da auditoria, recomposição dos vínculos e conferência operacional, não de uma reimportação automática.

## Arquivos e validação

- `features/importacoes/actions.ts` e `features/importacoes/remover-ausentes.ts`.
- `supabase/migrations/20261119205808_importacao_ausentes_preservar_acordos_judicializadas.sql`.
- `scripts/validate-importacao-ausentes-regra.ts`: banco Postgres isolado com PGlite; remoção, proteções, identidade, unidades resolvidas, falha de auditoria, histórico e idempotência.
- `scripts/validate-importacao-lotes.ts`: integração da conclusão; nenhuma remoção antes de terminar os lotes e alertas somente após a limpeza.

Comando de regressão: `node node_modules/tsx/dist/cli.mjs --test scripts/validate-importacao-ausentes-regra.ts scripts/validate-importacao-lotes.ts scripts/validate-importacao-ausentes.ts scripts/validate-importacao-recibo-ae.ts scripts/validate-conciliacao-recibos.ts` (22 testes aprovados).

`npm run typecheck` e `git diff --check` aprovados. Lint de `actions.ts` e `remover-ausentes.ts` sem erros; sete avisos existentes de funções/parâmetros não usados em `actions.ts`. As permissões da RPC foram verificadas no banco isolado: execução negada a `anon`/`authenticated` e concedida a `service_role`.

Migration aplicada em 19/11/2026 no projeto Supabase `GKLI - COB` (`vjcmotflmcczoepflhwc`), registrada como `20261119205808_importacao_ausentes_preservar_acordos_judicializadas`. O arquivo foi alinhado à versão gerada pelo Supabase. Conferidos pré-requisitos, corpo exato das duas assinaturas da RPC, `security invoker`, `search_path` vazio e execução restrita a `service_role`. Testes remotos com identificador nulo foram recusados sem acessar dados; advisor manteve as contagens anteriores e não apontou ocorrência para a RPC. A remoção efetiva e o rollback foram testados somente no banco sintético.

Após a aplicação, aguardar quality e Vercel Preview do commit final antes de merge do PR #42 e conferir Production READY ligado ao commit de main e ao domínio. Importações anteriores não são modificadas automaticamente. Os fluxos próprios de conversão PDF e Maestro mantêm suas rotinas existentes. Não executar reimportação, remoção, saneamento ou envio como parte da publicação.

## Publicação do ajuste de mensagens canceladas — 19/11/2026

Migration `20261119232502_importacao_preservar_mensagem_cancelada_com_copia.sql`, preparada no commit `c947ba7e`, aplicada no Supabase **GKLI - COB** (`vjcmotflmcczoepflhwc`) pelo CLI **2.117.0**, com dry-run prévio e alvo explícito: `db push --project-ref vjcmotflmcczoepflhwc --skip-vault --yes`. Somente essa versão foi listada/aplicada, sem seeds ou roles. O histórico passou de 318 para 319 versões.

Conferência remota somente leitura: as duas funções `importacao_substituir_cobrancas_anteriores(uuid)` e `importacao_remover_cobrancas_ausentes(uuid)` têm os dois filtros novos, mantêm `security invoker`, `search_path` vazio e execução restrita a `service_role`; o timeout existente da substituição foi preservado. As contagens do advisor de segurança permaneceram iguais antes/depois, sem novo apontamento para essas funções.

As três suítes isoladas `validate-importacao-ausentes-regra.ts`, `validate-importacao-substituicao-db.ts` e `validate-importacao-lotes.ts` passaram, incluindo o caso de mensagem cancelada com referências mistas, proteção da FK direta, bloqueio da mensagem ativa e rollback. Nenhuma rotina de limpeza foi executada contra registros reais para testar a publicação. Não houve reimportação, retomada de lote ou envio de mensagens.

Publicação da aplicação vinculada ao PR #45, usando a branch já existente `codex/limpeza-mensagem-cancelada`. Conferir quality e Vercel Preview da revisão final antes do merge; SHA de main, Production READY e alias serão registrados no próprio PR. Este ajuste passa a valer nas próximas operações de limpeza; não reabre importações nem altera mensagens históricas automaticamente.
