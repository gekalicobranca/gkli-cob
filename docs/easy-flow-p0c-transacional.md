# Easy Flow — P0-C transacional e recuperável

Data: 18/11/2026. Implementação local no worktree `C:/Users/Gekali/gkli-cob-easy-p0`, branch `codex/easy-p0-contencao`, sobre `871a57d4` e as alterações E0/P0-A/P0-B preservadas. Nenhuma migration, consulta ou operação foi executada em produção.

Continuidade: [preparação da publicação](easy-p0-publicacao.md) integra a P0 à `main` atual em `codex/easy-p0-publicacao`, preserva o ciclo de fechamento atual e amplia a suíte Flow para 19 testes. Os resultados abaixo documentam a etapa original; o relatório de publicação contém a matriz final.

## Contrato implementado

Execuções novas usam `protocolo=3`. A chave da montagem é `(execucao_id, indice)` de um plano imutável; mudança de plano exige outro resumo. Cada parte é registrada antes de criar artefatos e conserva snapshot, cobranças, IDs de lote/Flow/mensagens, hash do manifesto, hash dos vínculos e recibos de montagem/liberação. Índices únicos impedem duas partes com a mesma chave, reutilização de lote/Flow e duplicação da identidade Easy nos artefatos.

`flow_ids`, `parte`, `mensagens` e `liberadas` são projeções recuperáveis; a fonte da recuperação é `easy_flow_partes`. `concluido` significa liberação para agenda, não entrega ao destinatário.

### Preparação e montagem

1. Antes de planejar, obter snapshot no banco. A criação do resumo revalida esse snapshot sob trava, registra execução/partes e reserva cobranças, unidades e todos os canais da régua.
2. Preparar o conteúdo apenas com leituras. Reutilizar seleção da primeira etapa, resolução de contatos e templates, compliance e suspensões. Consolidar os débitos da mesma unidade/destinatário antes da renderização; manter todas as cobranças em itens e no payload da mensagem.
3. Em uma RPC, revalidar snapshot e ordem; criar lote, Flow pausado, mensagens sem agenda, itens/vínculos, promover somente as cobranças selecionadas e gravar recibo/auditoria/contadores. Uma parte gera um Flow com até 20 mensagens e até 40 cobranças; uma unidade não pode atravessar partes. O limite global continua em 5.000 cobranças.
4. Falha em qualquer escrita reverte a parte inteira. Repetir uma parte montada retorna o estado persistido antes de preparar conteúdo ou consultar configuração obsoleta.

O novo percurso não chama `criarFlowsCobranca`, o motor mutável `processarReguaCobranca` nem suas consolidações posteriores. Evita a promoção antecipada, os lotes parciais e a janela entre criação e correlação. Também não executa a liberação global de cobranças regulares nem grava scores durante preparação.

**Ajuste da proposta de lease:** a parte não mantém trabalho mutável fora da transação. A posse é a trava transacional do banco, mantida até commit/rollback; duas preparações podem ler, mas somente a primeira transação materializa a chave. A segunda encontra o recibo ou falha na revalidação. Não há lease vencido para reassumir, token a renovar ou trabalhador autorizado a continuar efeitos parciais. Se futuramente a montagem passar a ter etapas persistidas fora dessa transação, token, versão e lease voltam a ser obrigatórios antes de habilitar retries.

### Liberação

`easy_flow_liberar` consulta o recibo primeiro. Para uma liberação nova, confere ordem, snapshot de liberação, integridade dos artefatos, Flow pausado, mensagens pendentes sem agenda/envio/tentativa e SMTP/rota ainda válidos. Executa o ativador já instalado e grava recibo, contadores, auditoria e retirada das reservas na mesma transação. Falha após reservar horário também reverte a agenda.

A migration clona a definição vigente de `email_ativar_flow` para preservar as proteções previamente instaladas e mantém o OID da função pública. A função pública encaminha Flows gerenciados ao recibo transacional. O painel completo identifica esse percurso antes de rejeitar o status de um Flow já liberado e não executa o pós-processamento legado fora da transação.

Triggers impedem outro criador de escrever mensagens/itens sobre unidades/canais reservados e impedem agendamento/ativação direta de Flows Easy sem recibo. São `security definer` com `search_path` vazio apenas para ler as tabelas privadas sem quebrar escritores autenticados comuns; as RPCs de negócio são `security invoker`, restritas ao serviço, e revalidam perfil, carteira e autor. O serviço continua sendo uma fronteira confiável; isto não restringe um administrador de banco a alterar registros manualmente.

Não há chamada a provider, SMTP ou WhatsApp nessas RPCs. O worker existente continua responsável por tentativa e entrega. Repetição de liberação nunca rearma mensagens enviadas, canceladas ou incertas.

### Reconciliação e retomada

“Consultar andamento” executa a reconciliação autorizada do protocolo 3. Ela lê partes, artefatos e recibos; verifica IDs/conteúdo/vínculos, ordem, mensagens, tentativas e presença de agenda para e-mails ainda agendados. Recompõe os contadores e o estado correspondente, auditando mudanças de projeção.

- Parte sem recibo e sem efeito pode continuar usando a mesma chave; a RPC ainda revalida o snapshot antes de escrever.
- Parte montada recupera seus IDs; liberação com recibo recupera o resultado, mesmo se a resposta HTTP tiver sido perdida.
- Tentativa incerta, artefato removido/adulterado, liberação sem evidência ou divergência mantém `atencao`. Não cria mensagens substitutas, não reenvia, não anexa órfãos por aproximação e não retira reservas para permitir outra operação.
- Configuração ou dados alterados bloqueiam o commit/liberação. Resumo ainda não iniciado pode ser descartado por RPC serializada, com auditoria e remoção das reservas. Partes já montadas com configuração obsoleta exigem revisão manual; este pacote não cria cancelamento destrutivo de artefatos.
- Protocolo 1 permanece consultável, sem backfill automático ou retomada mutável. Só o autor com papel/carteira válidos pode reconciliar; intervenção administrativa em execução alheia continua sendo procedimento separado, não uma troca implícita de autor.

## Arquivos e compatibilidade

- Migration: `supabase/migrations/20261118220528_easy_flow_transacional.sql`.
- Preparação: `features/easy-cob/flow-preparacao.ts`; planejamento e hash canônico em `flow-server.ts`.
- Consumidores: `app/app/configuracoes/easy/flow/actions.ts`, `wizard.tsx` e `features/flows/cobranca/actions.ts`.
- Fixtures/verificações: `scripts/easy-flow-transaction-fixture.ts`, `validate-easy-flow-transaction.ts`, `validate-easy-flow-boundaries.ts`.

As novas mutações exigem `easy_flow_p0c_versao()=3`, além da contenção P0-A. RPC ausente não ativa fallback legado. A migration é aditiva, preserva execuções antigas com protocolo 1 e não altera o esquema de status existente. As tabelas novas têm RLS, sem acesso público/autenticado; eventos não têm grant de update/delete para serviço.

Os snapshots incluem dados financeiros e parcelas, contatos, condomínio, régua/etapas/templates, pausas/compliance/bloqueios, SMTP/rotas, acordos, scanner, agente/Maestro, progressão e mensagens relevantes. São hashes de JSONB ordenado, usados para detectar alteração concorrente, sem retornar credenciais. Dados promovidos pela própria parte e suas mensagens são tratados separadamente; partes posteriores não são invalidadas pela montagem anterior. Algumas configurações são conferidas com escopo conservador, podendo bloquear por mudanças externas não diretamente relacionadas.

## Verificação local e limites

```powershell
npm run test:easy-flow-transacional
npm run test:easy-p0
npm run test:easy-cap-transacional
node node_modules/tsx/dist/cli.mjs --test scripts/validate-easy-flow.ts scripts/validate-easy-captacao.ts
npm run typecheck
```

A suíte P0-C usa Postgres WASM em memória, estruturas sintéticas, a migration nova e o corpo histórico real do ativador; apenas o calendário é substituído por uma reserva local. As actions reais usam adaptador para esse banco com simulação de resposta perdida. A preparação é exercitada com dependências de leitura controladas. Não carrega `.env`, cliente remoto, dados de usuário ou providers.

Resultado: **17 testes P0-C**, **9 P0-A**, **24 P0-B** e **6 regressões existentes** passaram. TypeScript e ESLint dirigido aos oito arquivos TS/TSX envolvidos passaram, sem erros/avisos. Cobertura P0-C inclui rollback no fim da montagem e após agenda, retorno sem agendamento efetivo, replay, resposta perdida nas actions, consolidação/primeira etapa, partes sucessivas e ordem, reservas por mensagem/item, ativação direta/painel comum, permissões, alteração de contato/régua/SMTP/pagamento/judicial, recibos com configuração posterior indisponível, divergências/legado e envio incerto. Não houve build com geração de snapshot.

O comando P0-C desativa o tier-up WASM por uma falha nativa de liberação de código observada no Node 24 durante criação/destruição sucessiva das fixtures; isso não altera SQL ou regras de negócio. Uma execução anterior caiu no runtime V8 e não foi contada como validação.

A barreira de escrita é conservadora e global (`SHARE ROW EXCLUSIVE`), com `lock_timeout=5s` e orçamento de RPC de 60s. Preparação de conteúdo fica fora dela. Locks e snapshots devem ser medidos numa stack isolada representativa antes de implantação; timeout/deadlock exige consulta do resultado, nunca fallback. Não se declara SLA nem exclusão entre sessões reais com base no PGlite, que serializa uma conexão.

Pendências de homologação: cadeia completa de schema/grants/triggers, calendário SMTP vigente, workers reais com envio desabilitado, concorrência entre sessões (Easy/painel/Maestro), desempenho no limite e navegador. O ensaio atual não substitui esses critérios do plano para fechar P0 em um ambiente de implantação.

## Implantação futura e reversão

Ordem: P0-A → P0-B → P0-C → consumidores compatíveis e homologação isolada. Drenar requisições antigas antes da troca; uma migration não desfaz um motor HTTP legado já em execução. Toda execução prévia sem correlação permanece sujeita à contenção.

Reverter o consumidor deve suspender novas montagens/liberações e preservar ledger, recibos, reservas e auditoria. Não apagar essas evidências, reabilitar retry legado ou reenviar para “reconciliar”. Produção, deploy, workers, providers e banco remoto permanecem fora desta implementação.
