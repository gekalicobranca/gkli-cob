# Easy Cap — P0-B transacional

Data: 18/11/2026. Worktree: `C:/Users/Gekali/gkli-cob-easy-p0`. Branch: `codex/easy-p0-contencao`.
Estado: implementação e verificação locais; nenhuma alteração em produção.

## Resultado e contrato

A prévia nova prepara um plano puro e assinado, sem criar unidades nem alterar contatos. A confirmação usa exclusivamente `easy_captacao_confirmar`, aplicando em uma transação: unidades, complementos de contato, saneamentos, cobranças, parcelas, arquivo operacional dos ausentes, cancelamento de mensagens/agenda/progressão, histórico do síndico, auditoria, conclusão da conversão e recibo durável do resultado.

Qualquer erro reverte as escritas da tentativa, inclusive erro depois das alterações financeiras, na conclusão ou na gravação do recibo. Resposta HTTP interrompida depois do commit não altera a conversão para `falha`; o recibo pode ser consultado ou recuperado pela repetição da mesma operação.

Fluxo:

1. `POST /api/easy-cob/captacao`: parser/validação → preparação pura → snapshot protocolo 2 → gravação da prévia, plano, SHA-256 e HMAC.
2. Interface mostra condomínio, valores, recorte elegível, avisos e ID; exige conferência do relatório completo.
3. `POST /api/conversao-relatorio/confirmar`: autentica, confere perfil/carteira/autor, verifica HMAC e reconstitui o plano puro para comparar o digest. O navegador envia IDs e confirmação, nunca arrays de mutação.
4. RPC revalida origem/autor/carteira e parâmetros; procura recibo antes de tentar nova aplicação. Sem recibo, confere estado, configuração, agente, execuções conflitantes e snapshot.
5. Aplica os efeitos, auditoria, status final e recibo na mesma transação. Cache é revalidado depois; falha de cache não muda o resultado confirmado.

Prévia e plano ficam em `conversoes_relatorio.preview_json.easyCaptacao`. Serialização canônica torna o digest/HMAC estável à ordenação de chaves pelo JSONB. A prévia assinada permanece imutável depois do commit.

`easy_captacao_resultados` tem chave primária por conversão, carteira, operador, hash e resultado. MD5 interno compara a representação JSONB em replays; não substitui o HMAC/SHA-256 verificado no servidor. RLS habilitada, nenhum acesso dos papéis públicos e somente SELECT/INSERT para `service_role`, com revogação explícita dos demais grants e defaults. Não foram adicionadas chaves ao cliente.

## Decisões de integridade

- Correspondência por recibo canônico na unidade preserva o ID da cobrança elegível. Sem recibo, usa vencimento e ausência de recibo; múltiplas correspondências abortam.
- Buscas com/sem recibo são separadas para usar o índice de identidade e evitar varredura ampla por OR parametrizado.
- Ausente elegível é suspenso e depois arquivado pelo mecanismo existente; não é excluído fisicamente. Seus vínculos e parcelas históricas permanecem.
- Se um trigger alterar valores/pagamentos durante a preparação do arquivo, o commit é recusado. Gravação financeira que diverge do plano também é recusada.
- Parcelas operacionais de cobrança atualizada só podem ser substituídas quando o predicado permite; antes/depois das parcelas ficam na auditoria. Falha por FK/proteção causa rollback.
- Recibo arquivado que reaparece não é reativado nem duplicado automaticamente: permanece protegido e é contado entre as linhas preservadas. Eventual reabertura exige revisão própria.
- Nome ausente/provisório, e-mail ausente e telefone ausente são complementados; contatos cadastrados não são sobrescritos. Criação e complemento ocorrem apenas na RPC.
- Identidade literal de unidade/bloco compara trim e caixa. Equivalência com zeros à esquerda sem identidade literal é recusada para revisão, sem criar unidade duplicada.
- Contatos conflitantes entre linhas abortam na preparação. Unidade nova e responsável divergente geram saneamento associado à conversão, sem duplicar pendência aberta.

O helper `easy_captacao_substituiveis` é compartilhado pelo snapshot e commit. Mantém ano corrente em São Paulo e estados `regular`, `novo`, `em_cobranca_ativa`, acrescentando barreiras explícitas para pagamentos/data/valor pago, situação financeira protegida, acordos diretos/associativos, baixas de scanner, automação bloqueada, unidade judicial, cópias/dependentes, arquivo e parcelas com pagamento/cancelamento.

O recorte anual governa quais cobranças existentes são substituíveis; não autoriza atualizar cobranças antigas protegidas. Linhas novas fora da régua ficam no histórico. Uma cobrança elegível já existente e presente fora da régua é atualizada como regular, mantendo seu ID. Correspondências protegidas não recebem valores novos nem são duplicadas.

Classificação considera início da régua, Garantidora, HFlex/possível acordo e unidade judicial. O desempate judicial segue vencimento, recibo em ordem numérica e ordem original. O histórico do síndico usa todas as linhas do relatório e a competência de fechamento no dia 10; classifica por unidade/acordos/status operacional, sem transformar o relatório em evidência de pagamento.

Eventual ranking preliminar JSON/XLSX do parser permanece na prévia assinada. Esta entrega não o regrava após o commit. O resultado final deste percurso está no recibo e em `captacao_historica_sindico`; consumidores devem usar essas fontes, sem tratar a prévia como relatório financeiro conciliado.

## Concorrência e recuperação

O snapshot protocolo 2 inclui digest de condomínio/configuração, unidades/contatos, cobranças/parcelas, acordos/vínculos, baixas, dia e IDs elegíveis. Mudança após a leitura exige nova prévia. Uma segunda conversão da mesma base fica obsoleta após a primeira aplicação. Replay do mesmo ID/plano retorna o resultado persistido.

O commit usa barreira `SHARE ROW EXCLUSIVE` nas tabelas envolvidas, `lock_timeout=5s` e `statement_timeout=60s`. Ela protege contra escritores que não compartilham advisory locks, mas **pode atrasar escritas de outras carteiras**. É uma barreira conservadora global, não uma solução otimizada por condomínio. Leituras seguem possíveis. O teste PGlite não substitui ensaio com sessões Postgres reais.

Easy Flow bloqueante, montagem Maestro pendente/processando/em atenção, captação antiga Easy em falha/processamento e progressão em processamento impedem aplicação. Envio/tentativa em andamento ou incerto também bloqueia. Não há limpeza automática dessas pendências para destravar.

Mensagens pendentes afetadas são canceladas com motivo e histórico preservado; agenda correspondente e progressão pendente são canceladas; agregados dos Flows são recalculados. Mensagem enviada não é apagada ou reenviada. A RPC não chama providers e não ativa comunicação após a captação.

- `EASY_CAP_COMMIT_REJECTED`: recusa conhecida, sem efeito parcial desta tentativa. Conferir mudanças, permissões e pendências e gerar nova prévia.
- `EASY_CAP_RESULT_REQUIRES_LOOKUP`: resposta/serviço indisponível, com commit possivelmente realizado. UI bloqueia outro arquivo e exige consulta da mesma operação.
- GET de diagnóstico respeita autor/carteira e devolve contadores do recibo. Protocolo novo concluído sem recibo exige conferência.
- Sem recibo e ainda em prévia, GET não distingue execução não iniciada de transação aberta. Depois da consulta, só é permitida retomada do **mesmo ID**, protegida pela idempotência; timeout não comprova ausência de efeito.
- Prévia antiga continua suspensa e precisa ser relida. `easy_preparar_captacao` destrutiva segue desabilitada; não existe fallback ao loop HTTP antigo.

## Arquivos e verificações

Migration criada por CLI: `supabase/migrations/20261118211109_easy_cap_commit_transacional.sql`. Adiciona recibos/índice não único, centraliza predicado/snapshot e implementa auditoria/commit restritos ao servidor.

Código: `features/easy-cob/captacao-plano.ts`, `captacao-commit.ts`, `captacao-assinatura.ts`, `captacao-preview.ts`; APIs de prévia/status/confirmação; UI `captacao/upload.tsx` e texto do wizard Flow. Outros percursos de importação e os controles P0-A de Flow permanecem separados.

Testes: `scripts/easy-cap-transaction-fixture.ts`, `validate-easy-cap-transaction.ts`, `validate-easy-cap-boundaries.ts`. O harness anterior ganhou compilação JSX e globals explícitos para a recuperação da interface, sem rede.

```powershell
npm run test:easy-cap-transacional
npm run test:easy-p0
node node_modules/tsx/dist/cli.mjs --test scripts/validate-easy-flow.ts scripts/validate-easy-captacao.ts
npm run typecheck
```

Fixtures sintéticas usam migrations reais de inventário de recibos, proteção/auditoria de arquivo e estruturas de histórico/saneamento. Fronteiras HTTP executam com adaptador para PGlite; interface usa harness de eventos/hooks, não navegador real.

Cobertura: operação completa, nove pontos de falha com rollback integral, resposta perdida após commit, replay, ausência de RPC sem fallback, carteira/autor/grants, plano adulterado, snapshot obsoleto, matriz de preservação, envios incertos, judicial/Garantidora/HFlex, identidade ambígua, trigger que desvia valores e limite de 5.000 linhas. O ensaio de 5.000 cobranças da mesma unidade confirmou em cerca de 5–6 segundos no PGlite após otimização; não é SLA de produção.

Resultados desta etapa: **24 testes P0-B**, **9 testes P0-A** e **6 regressões existentes** passaram. TypeScript passou; ESLint dirigido aos 13 arquivos TS/TSX envolvidos não apontou erros ou avisos. `git diff --check` passou e o lockfile permaneceu sem alteração. Nenhum build com geração de snapshot remoto foi executado.

Pendências antes de implantação: schema completo/grants/dependências do alvo; concorrência entre sessões e workers reais; tempo e contenção da barreira global; navegador e stack isolada completa; conferência dos consumidores do ranking preliminar. Nada disso foi substituído por consulta a produção.

## Implantação futura e reversão

Nenhuma migration foi aplicada fora das fixtures. Não houve deploy, worker, SMTP, WhatsApp, portal ou consulta a banco de produção. O checkout original permanece preservado.

Ordem futura: P0-A → migration P0-B → consumidor compatível e homologação → ativação no escopo autorizado. Código novo recusa snapshot sem protocolo 2 ou ausência da RPC. Drenar requests antigos antes da troca: uma migration não desfaz importação HTTP já iniciada.

Reversão deve suspender novas confirmações e preservar diagnósticos, recibos, arquivo e auditoria. Não apagar dados confirmados nem reabilitar a preparação destrutiva. Continuidade posterior: [P0-C de Flows](easy-flow-p0c-transacional.md) implementado localmente, com homologação integral ainda pendente.
