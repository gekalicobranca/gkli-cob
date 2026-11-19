# Publicação conjunta do Easy Cob P0 e P1

Candidata local na branch `codex/easy-p1-consistencia`, integrada à main `d66689fe`. Escopo de banco no [manifesto com SHA-256](easy-p0-p1-migrations.json). A versão `20261119205808` já pertence à main e ao histórico de produção. As sete novas versões têm numeração anterior a ela.

| Ordem | Versão | Efeito |
| ---: | --- | --- |
| 1 | 20261118205314 | Contém a confirmação antiga e protege contra execuções Easy Flow conflitantes. |
| 2 | 20261118211109 | Instala substituição transacional e recibo do Easy Cap. |
| 3 | 20261118220528 | Instala montagem, liberação e reconciliação dos Flows por protocolo. |
| 4 | 20261119204222 | Torna atômicos cancelamento do acordo, documento e auditoria. |
| 5 | 20261119205321 | Exige consentimento versionado do Easy Maestro e o revalida no worker. |
| 6 | 20261119205324 | Habilita recuperação administrativa por carteira, motivo e versão. |
| 7 | 20261119205728 | Registra término das novas consultas Pag e expõe saúde das filas. |

## Decisões antes da janela

Referência de 19/11 às 18h54 de Brasília: 2 pedidos Easy Maestro pendentes, 0 em execução, 0 montagens e 0 ativações pendentes. Dos 15 Flows legados, 1 estava aberto e não havia conflito por condomínio. As contagens são históricas. O gestor da carteira deve registrar a decisão por caso no registro operacional restrito. No relatório da publicação bastam contagens, responsável, horário e desfecho.

**Dois pedidos Maestro.** Conferir individualmente estado, receita, seleção, carteira, consentimento disponível e evidências de importação, montagem, ativação e tentativa. Preferir que o operador resolva os pedidos antes do corte. Aguardar o processamento normal só quando os efeitos antigos, inclusive eventual ativação, já estiverem autorizados. Uma alternativa é o encerramento auditado pelo procedimento operacional aplicável, conferindo o escopo antes da ação. A pausa de agenda por condomínio pode cancelar outros pedidos. Se não houver encerramento individual seguro, manter esses pedidos e seus consumidores contidos e adiar a retomada desse escopo. Um pedido retido pode voltar a ser escolhido pelo worker e bloquear a fila; se não houver isolamento comprovado, adiar o corte. Nunca fabricar consentimento para o lote antigo. Só criar pedido substituto após conferir o encerramento e a ausência de efeitos duplicáveis, usando a nova prévia e confirmação. Qualquer resultado incerto segue para revisão.

**Um Flow legado aberto.** Conferir o estado real, vínculos explícitos, lotes, mensagens, agenda, tentativas e eventuais envios no monitor da carteira. Se já tiver encerrado, registrar o resultado. Se permanecer aberto, conservar a trava do condomínio. A atualização atribui protocolo 1 aos registros existentes. O reconciliador administrativo e o descarte do protocolo 3 não encerram esse legado. Adiar a reabertura para o condomínio enquanto faltar evidência. Se o restante não puder operar isoladamente, adiar a reabertura geral. Não inferir vínculos, alterar protocolo/status manualmente, liberar agenda ou reenviar para encerrar a pendência.

## Execução futura

1. **Responsável pela publicação.** Registrar o SHA candidato, a base da main e o alvo. Conferir `node scripts/validate-easy-p0-p1-manifesto.mjs` no checkout revisado. O PR #40 é da P0 isolada e estava draft com um check externo falho. Usar uma revisão conjunta deste SHA; resolver o check do provedor e confirmar que a aplicação poderá ser publicada antes de mudar o banco. Evitar promover primeiro o PR isolado.
2. **Operação.** Combinar a janela com quem administra workers e canais. Conter entradas mutáveis Easy e consumidores afetados antes do corte, conferir leases e tentativas em andamento e registrar como restaurar cada controle. Repetir, em sessão de leitura autorizada, `scripts/easy-p0-preflight.sql` e `scripts/easy-p0-p1-janela.sql`. Exigir zero conflitos por condomínio e zero pares duplicados. Comparar histórico e decisões dos casos acima. Confirmar disponibilidade de recuperação do banco pelo responsável. Em caso de divergência ou de fila sem contenção segura, suspender o corte.
3. **Banco.** No checkout candidato, usar o executor Supabase com registro de histórico e alvo explicitamente conferido. Com CLI 2.117.0, usar primeiro `db push --include-all --dry-run` no alvo escolhido. Só prosseguir se a saída listar exatamente as sete versões acima, nessa ordem. Esta opção inclui versões anteriores à última aplicada. Executar pelo mesmo mecanismo e alvo com a autorização de implantação, sem seeds. Não executar arquivos avulsos em paralelo nem marcar versões aplicadas manualmente. Registrar cada confirmação e conferir o histórico efetivo se houver interrupção.
4. **Conferência.** Executar `scripts/easy-p0-pos-migrations.sql` e `scripts/easy-p0-p1-pos.sql` em leitura. Conferir as sete versões e a preservação de `20261119205808`. A referência homologada foi de 311 para 318 versões. Se houver nova migration na main ou no alvo, reconciliar o manifesto antes de prosseguir.
5. **Aplicação.** Publicar o SHA revisado com os consumidores ainda contidos. Conferir login, acesso por carteira, painéis Maestro/Pag, diagnóstico administrativo e consulta de recibos com perfis apropriados. Usar operações de leitura no smoke de produção. Conferir fila, tentativas, agenda e heartbeats com a linha de base da janela; workers sob demanda podem ficar sem sinal entre rodadas.
6. **Retomada.** Liberar primeiro o escopo com decisão registrada e sem pendência de efeito incerto. Acompanhar o primeiro ciclo de pedidos autorizados e comparar pedidos, recibos, contadores e agenda. Reavaliar separadamente os dois pedidos e o condomínio legado antes de retirar sua contenção.

**Interrupção ou falha.** Manter as entradas e consumidores afetados contidos, registrar última migration confirmada e consultar histórico/recibos. Preservar lançamentos, documentos, agendas, tentativas e auditoria. Corrigir para frente ou usar consumidor compatível com as proteções instaladas. Uma falha da aplicação não autoriza down migration, retry de envio, exclusão de recibos ou reativação do caminho destrutivo do Cap.

[Evidências de homologação estrutural, concorrência e precondições](easy-cob-p1-consistencia.md).

## Evidência da candidata integrada

Em 19/11/2026, o build Next.js com TypeScript passou e os 92 testes de P0, P1 e regressão de importação da main passaram. O verificador local confirmou os sete arquivos, ordem e hashes. Em Postgres 17.11 isolado, usando a exportação estrutural e o histórico de 311 versões já obtidos, os dois preflights, as sete migrations e as duas conferências posteriores passaram. O histórico local terminou em 318 versões. Nesta preparação não houve acesso ao banco de produção, push, merge remoto ou deploy.

## Janela de implantação — 19/11/2026

A publicação foi autorizada no chat de publicação para o conteúdo do chat Dev Easy. O PR #40 passou a reunir P0 e P1 por avanço normal da branch remota existente `codex/easy-p0-publicacao`; o checkout permaneceu em `codex/easy-p1-consistencia`, sem criação de branch e sem sobrescrever alterações. Base `d66689fe`; candidata de código `236d61a8`.

- Pré-checagem remota: 311 migrations, zero conflitos por condomínio e zero pares duplicados de Flow/itens. Backup diário GitHub concluído (run `44518225117`); exportação estrutural de 19/11 disponível no diretório operacional local restrito. A homologação estrutural em Postgres 17.11 e o manifesto das sete versões já estavam conferidos.
- A revisão `236d61a8` passou no check `quality` e no Vercel Preview (`DLHiJ3wGEiXSj94Q1asTC2FLJWhn`). O Preview desta branch recebeu overrides sem credenciais reais para as quatro variáveis Supabase; não usa o banco de produção. Por isso não comprova login ou operações com dados reais.
- Os testes locais tiveram 106 sucessos e uma falha no verificador antigo do manifesto P0, que esperava apenas três migrations. O verificador foi ajustado para confirmar o prefixo P0 e as sete migrations conjuntas. Sua reexecução passou nos dois casos; nenhuma migration foi alterada nessa correção.
- Contenção antes do banco: regra WAF temporária `Janela Easy P0 P1 PR40 temporaria`, bloqueando métodos diferentes de GET nas entradas Easy e na confirmação do conversor. Inclui `/app/configuracoes/easy`, o caminho lab, `/api/easy-cob`, `/api/easy-pague` e `/api/conversao-relatorio/confirmar`. Resposta de contenção conferida por HEAD: 403 com `X-Vercel-Mitigated: deny`. Nenhuma proteção existente foi desativada. Remover apenas essa regra após Production READY.
- `captacao_global` foi temporariamente pausada, com o estado anterior preservado em `auditoria_eventos` (`easy_pr40_janela_inicio`). Dois pedidos legados, ambos sem tentativas, início, arquivos ou montagem, passaram de `pendente` para `precisa_intervencao`, com motivo, antes/depois e logs. Evento `easy_pr40_legado_retido`. Não houve execução, cancelamento, conclusão, consentimento fabricado ou pedido substituto. Reavaliar esses dois pedidos separadamente antes de retomá-los.
- O único Flow legado aberto permaneceu com o status e a trava do condomínio preservados. A migration o identifica como protocolo 1; não foi reconciliado nem convertido manualmente para protocolo 3.
- No alvo **GKLI - COB**, ref `vjcmotflmcczoepflhwc`, o CLI **2.117.0** executou `db push --project-ref vjcmotflmcczoepflhwc --include-all --skip-vault --dry-run`, listando exatamente as sete versões deste manifesto, sem seeds ou roles. A mesma execução com `--yes` aplicou as sete migrations. Não houve alteração manual do histórico.
- `scripts/easy-p0-pos-migrations.sql` e `scripts/easy-p0-p1-pos.sql` passaram em leitura no alvo, incluindo preservação de `20261119205808`, RLS, grants e triggers. Os consumidores continuam contidos até o merge, Production READY e conferência do alias. O resultado final, SHA de merge, deployment e restauração dos controles serão registrados no PR #40.

Retomada: restaurar `captacao_global` ao valor original somente após Production READY e conferir ausência de novas execuções indevidas. Manter os dois pedidos em revisão e o condomínio legado bloqueado. O smoke de produção deve ser somente leitura; não importar dados, cancelar acordos, montar ou ativar Flows nem enviar mensagens para testar a publicação.
