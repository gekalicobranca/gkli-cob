# Easy Cob P0 — candidata à publicação

Preparada em 18/11/2026. **Estado: candidata local; sem push, PR remoto, migration remota ou deploy.** A homologação com schema completo e sessões concorrentes continua sendo condição para liberar produção.

## Identidade e escopo

- Repositório: `gekalicobranca/gkli-cob`.
- Worktree: `C:/Users/Gekali/gkli-cob-easy-p0`.
- Branch candidata: `codex/easy-p0-publicacao`, criada sobre `origin/main` em `c36d4e93`.
- Preservação: a implementação anterior está no commit local `cba6b82e`, branch `codex/easy-p0-contencao`. O diretório operacional `C:/Users/Gekali/gkli-cob` não foi editado.
- A candidata contém somente o patch P0 sobre a `main`; não transporta os três commits exclusivos da base antiga relativos ao histórico local de migrations.
- P0-A: contenção de execuções incertas e suspensão da preparação destrutiva antiga.
- P0-B: Easy Cap transacional, incluindo unidades, contatos, cobranças/parcelas, arquivo/auditoria e conclusão, com recuperação por recibo.
- P0-C: ledger por parte, montagem pausada atômica, liberação/agenda/recibo em transação e reconciliação por evidências.

Na atualização para a `main`, quatro conflitos foram resolvidos preservando a preparação transacional e as mudanças atuais de captação manual e ciclo de cobrança. O plano Easy Cap passou a transportar marcadores manuais `A/AE/J/AJ`, sem perder status, observação de origem ou bloqueio de automação. A montagem Flow usa o ciclo canônico e a proteção SQL aceita histórico enviado em ciclo anterior somente com Flow encerrado; mesmo ciclo, Flow ativo e estado incerto continuam bloqueantes. A comparação SQL/TypeScript do fechamento inclui meses curtos e o fuso de São Paulo.

## Conteúdo de banco — lista fechada

Somente estas migrations novas fazem parte da P0, nesta ordem:

1. `20261118205314_easy_p0_contencao.sql`.
2. `20261118211109_easy_cap_commit_transacional.sql`.
3. `20261118220528_easy_flow_transacional.sql`.

O manifesto `docs/easy-p0-migrations.json` registra SHA-256 dos arquivos. Alterar SQL após homologação invalida o manifesto e exige nova revisão/validação. Nenhuma migration histórica deve ser reaplicada, renomeada ou “reparada” para acomodar esta entrega. A migration de exclusão Easy já presente na `main` não integra essa lista.

Não executar `npm run supabase:push`, `npm run supabase:query` ou um `db push` geral: o primeiro e o último podem carregar migrations além da lista; o segundo usa `--linked`. O histórico alvo deve ser comparado em sessão autorizada antes de qualquer operação. CLI local observada: 2.117.0; não trocar para v3 durante a publicação sem revisar comandos e alvo.

## Verificações preparadas

```powershell
npm run test:easy-p0
npm run test:easy-cap-transacional
npm run test:easy-flow-transacional
npm run test:easy-p0-publicacao
node --no-wasm-tier-up node_modules/tsx/dist/cli.mjs --test scripts/validate-easy-flow.ts scripts/validate-easy-captacao.ts scripts/validate-easy-planilha-manual.ts
npm run typecheck
npm run build
```

O `prebuild` foi inspecionado: lê migrations/config locais e gera `lib/backup/schema-files.generated.ts`; não consulta banco. O build desta candidata é local e sem `.env.local`/credenciais Supabase herdadas. O snapshot gerado acompanha o commit candidato. O build não prova compatibilidade do banco.

Resultados desta preparação: **65 testes distintos passaram** — 9 de contenção, 25 Easy Cap, 19 Easy Flow transacional, 6 regressões existentes, 4 de planilha manual e 2 de publicação. A execução ampla de negócio/regressão confirmou 63; a execução dirigida final de Flow/publicação confirmou 21, dos quais 19 já estavam na ampla. `npm run typecheck`, `npm run build`, ESLint dirigido aos arquivos P0 e `git diff --check` passaram. Nenhum desses resultados representa um check remoto de GitHub/Vercel.

O comando `test:easy-p0-publicacao` reúne essa matriz, usa duas suítes concorrentes para limitar pressão de memória e desativa tier-up WASM pelo problema V8 registrado no relatório P0-C. Não instala dependências nem carrega credenciais. O lockfile está preservado.

O gerador atualizou 22 entradas do snapshot: 19 migrations já presentes na `main` e as 3 novas da P0. Isso corrige a defasagem do arquivo gerado; o diff de fontes de migrations contra a base continua contendo **somente as três da lista fechada**, verificado automaticamente junto aos hashes e ao conteúdo do snapshot.

Diagnósticos SQL, preparados para execução futura e **não executados em ambiente remoto**:

- `scripts/easy-p0-preflight.sql`: transação somente leitura, dependências de schema, colunas/assinaturas essenciais e conflito de execuções. Retorna contagens agregadas; não corrige ou expõe IDs, contatos e valores.
- `scripts/easy-p0-pos-migrations.sql`: transação somente leitura, versões, RLS/grants, RPCs, guards e suspensão da rotina antiga. Não inicia, libera ou reconcilia operações.

Os dois diagnósticos são testados em Postgres WASM sintético, incluindo recusa por grant indevido e coluna ausente. Não substituem replay da cadeia completa, avaliação de grants do alvo ou teste de concorrência real.

## Condições de publicação

Antes de habilitar produção, registrar evidências vinculadas ao SHA candidato para:

1. Schema isolado representativo e compatibilidade da cadeia/grants/triggers atuais. Conferir assinatura e corpo vigente do ativador e seleção exclusiva de SMTP.
2. Duas sessões Postgres reais disputando montagem/liberação, painel e Maestro, com rollback, timeout e perda de resposta. As fixtures PGlite serializam uma conexão.
3. Volume representativo, inclusive 5.000 cobranças: medir duração dos snapshots e tempo de bloqueio. As barreiras globais de escrita são conservadoras; não há SLA derivado da fixture.
4. Navegador e workers em ambiente isolado, com envio externo desabilitado, cobrindo retomada por ID, régua/canal, SMTP, agenda e estados incertos.
5. Nenhuma execução legada ambígua, pedido antigo em andamento ou release simultâneo sem decisão operacional registrada. Não anexar artefatos por aproximação para remover esse bloqueio.

Essas condições são critérios técnicos pendentes, não evidência de que produção esteja autorizada ou pronta.

## Roteiro da publicação futura

Seguir `docs/fluxo-desenvolvimento-publicacao.md` da `main` atual: branch → PR → checks `quality`/Vercel e Preview conferidos → merge aprovado para `main` → Production do SHA resultante. Não usar deploy local/manual em produção nem push direto para `main`.

1. Confirmar que `origin/main` ainda corresponde à base analisada; caso tenha avançado, integrar e repetir as verificações afetadas. Conferir o manifesto e o diff contra `main`, especialmente que só existem três migrations novas.
2. Revisar a configuração de Preview antes de enviar a branch: o banco deve ser isolado, workers/cron e providers não podem usar dados ou canais de produção. Não presumir isolamento por ser Preview.
3. Enviar a branch candidata e abrir PR em rascunho usando a descrição preparada. Não marcar pronto enquanto a homologação acima estiver pendente. Aguardar checks e conferir o SHA efetivamente testado.
4. Em janela autorizada, bloquear novas entradas Easy Cap/Flow e drenar requisições/montagens antigas e escritores concorrentes. A contenção no banco não desfaz requisição HTTP legada já iniciada.
5. Conferir alvo e backup recuperável conforme `docs/backup-e-recuperacao.md`. Executar preflight no alvo autorizado; qualquer divergência interrompe a publicação sem saneamento automático.
6. Aplicar somente a lista fechada, registrando resultado e versão de cada migration. Conferir pós-migrations; recusar avanço se algum contrato falhar. Conferir recarga de schema e acesso das RPCs pelo serviço.
7. Após migrations e homologação, aprovar o merge conforme o fluxo protegido do projeto. Conferir que Production está `READY` para o SHA resultante e domínio correto. Um PR aprovado antes da readiness do banco não substitui a janela de publicação.
8. Fazer smoke test no escopo piloto explicitamente autorizado; distinguir prévia, commit, montagem, liberação e entrega. Mensagem real só pode ser liberada com autorização de envio correspondente. Observar recibos, execuções bloqueantes, erros e latência/locks sem repetir comandos incertos.
9. Reabrir as entradas somente depois de conferir os resultados. Guardar SHA, manifesto, ambiente, executor, horários, migrations, checks e evidências no registro da publicação.

## Reversão e interrupção

- Falha no preflight: não executar migrations e não alterar dados para fazê-lo passar.
- Falha em uma migration: interromper. As migrations têm transação própria; conferir o histórico e os contratos para distinguir falha antes/depois do commit. Não reaplicar às cegas nem marcar migrations como executadas.
- Falha na aplicação: manter as mutações Easy suspensas e os dados/recibos/reservas/auditoria preservados. Preferir uma correção de consumidor compatível. O consumidor anterior é inseguro e não é um rollback funcional aceitável.
- Falha/timeout de montagem ou liberação: consultar a execução e reconciliar recibos, nunca reenviar para “ter certeza”. Legado e divergência permanecem bloqueantes até decisão auditada.
- Não executar down migrations destrutivas, apagar ledger/recibos ou reabilitar `easy_preparar_captacao`. Não restaurar banco para desfazer somente esta entrega sem procedimento específico: isso pode remover operações legítimas posteriores.

## Descrição pronta do PR

Título: **Easy Cob P0: commits transacionais e recuperação por recibos**.

Corpo em `docs/easy-p0-pr.md`. A criação remota do PR, push, aplicação das migrations e merge não foram feitos nesta preparação.
