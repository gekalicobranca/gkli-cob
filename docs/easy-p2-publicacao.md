# Publicação do Easy Cob P2

Candidata local na branch `codex/easy-p2-experiencia`, integrada à `main` em `e2488313`. O PR #40 incorporou P0/P1 em `0558b32b`. O PR #45 acrescentou a correção de importação à base. O diff de banco da P2 contra essa base contém **uma migration**. O pacote inclui a interface Easy, o simulador de acordo, o worker do Espelhar, a retenção e a referência de desempenho. O documento final de acordo fica para uma entrega própria.

## Ordem do banco

| Ordem de versão | Migration | Situação para a janela |
| ---: | --- | --- |
| 1 | `20261118205314_easy_p0_contencao` | P0/P1, aplicação registrada na janela anterior |
| 2 | `20261118211109_easy_cap_commit_transacional` | P0/P1, aplicação registrada |
| 3 | `20261118220528_easy_flow_transacional` | P0/P1, aplicação registrada |
| 4 | `20261119204222_acordo_cancelamento_transacional` | P0/P1, aplicação registrada |
| 5 | `20261119205321_easy_maestro_consentimento` | P0/P1, aplicação registrada |
| 6 | `20261119205324_easy_recuperacao_administrativa` | P0/P1, aplicação registrada |
| 7 | `20261119205728_easy_saude_workers` | P0/P1, aplicação registrada |
| 8 | `20261119205808_importacao_ausentes_preservar_acordos_judicializadas` | Versão anterior da main que já constava no histórico antes da aplicação das sete acima |
| 9 | `20261119232502_importacao_preservar_mensagem_cancelada_com_copia` | PR #45, pré-requisito da base integrada. Conferir o histórico do alvo na janela |
| 10 | `20261120000100_easy_retencao_previas` | Única adição P2. Aplicar se pendente após conferir o histórico |

A tabela indica a ordem das versões relevantes. O replay parte das versões ausentes em cada ambiente. A [janela P0/P1](easy-p0-p1-publicacao.md) registra a sequência efetiva daquele corte. O [manifesto P2](easy-p2-migrations.json) fixa a base e o SHA-256 do SQL, normalizado em UTF-8/LF. O snapshot em `lib/backup/schema-files.generated.ts` inclui a migration do PR #45 e a P2.

## Roteiro da janela autorizada

1. **Identificar a candidata.** Registrar SHA do código revisado, revisão anterior do app e revisão instalada do worker do Espelhar. Na raiz, executar `node scripts/validate-easy-p0-p1-manifesto.mjs docs/easy-p2-migrations.json`. Se a main avançar, comparar novamente as alterações de código e banco antes de publicar.
2. **Conferir o alvo em leitura.** Comparar versões e nomes de `supabase_migrations.schema_migrations` com a tabela. Quando a base estiver completa e a P2 pendente, o dry-run do CLI direcionado ao projeto deve listar apenas `20261120000100`. Se faltar a migration do PR #45, tratar a pendência com o responsável por importação e repetir a conferência. Se a P2 já constar, verificar os objetos instalados e seguir para os consumidores. Não reparar histórico por suposição.
3. **Banco antes dos consumidores.** Aplicar a migration revisada e registrar o resultado. Os dois triggers passam a recusar a primeira aplicação de prévias elegíveis com sete dias, inclusive prévias já existentes. A instalação não limpa dados nem agenda jobs. Conferir os objetos e privilégios com as consultas abaixo.
4. **Publicar app e worker.** Implantar o commit aprovado do Next.js e conferir estado READY e alias. Distribuir também o código do Espelhar ao host que executa `scripts/acordos-portais/espelhamento-fontes.ts`, incluindo `espelhamento-temporarios.mjs`. Confirmar a revisão carregada na próxima execução normal do worker. O deploy web isoladamente não comprova atualização do host.
5. **Smoke em leitura.** Com usuário e carteira de teste autorizados, abrir o menu Easy em tela estreita e percorrê-lo pelo teclado. Conferir filtros de Acordos e Cobranças, telas de Cap, Flow, Pag, Maestro e Espelhar. No ensaio isolado, validar também o TXT de simulação, perda de resposta, consulta pelo mesmo ID e rejeição de prévia vencida. Reservar mutações, envios e agendamentos de teste ao ambiente isolado.
6. **Manutenção após a publicação.** Operações define responsável e cadência por carteira. A primeira passagem de `easy_expirar_previas` usa a forma de dois parâmetros, que apenas conta o lote elegível. A aplicação efetiva da limpeza tem decisão e registro próprios. Os dois pedidos Maestro retidos e o Flow legado aberto registrados na P0/P1 seguem seu procedimento de revisão. A P2 não toma decisões sobre esses casos. [Critérios de retenção e operação](easy-cob-p2-retencao.md)

Conferência pós-migration em leitura. Esperar uma linha com `false, false, true` para execução da função e duas linhas com triggers habilitados para escrita normal (`O` ou `A`).

```sql
begin read only;
select has_function_privilege('anon', 'public.easy_expirar_previas(uuid,text,boolean,integer)', 'EXECUTE') as anon,
       has_function_privilege('authenticated', 'public.easy_expirar_previas(uuid,text,boolean,integer)', 'EXECUTE') as authenticated,
       has_function_privilege('service_role', 'public.easy_expirar_previas(uuid,text,boolean,integer)', 'EXECUTE') as service_role;
select tgrelid::regclass as tabela, tgname, tgenabled
from pg_trigger
where (tgrelid, tgname) in (
  ('public.conversoes_relatorio'::regclass, 'easy_cap_prazo'),
  ('public.easy_flow_partes'::regclass, 'easy_flow_prazo')
);
commit;
```

**Se a janela for interrompida**, conferir a última versão efetivamente aplicada e o estado do deploy. Suspender a manutenção mutável. Se a falha for do consumidor, reverter app ou worker à revisão compatível anterior e manter as proteções do banco. A versão anterior pode exibir mensagem genérica para prévia vencida. Preservar recibos e consultar a operação quando houver resultado incerto. Reverter o binário não recompõe staging já removido.

## Documento final do acordo

A entrega atual oferece **Baixar simulação (TXT)** com as condições e parcelas revisadas. Criar um acordo, aprovar uma proposta, registrar aceite e homologar são ações distintas. O download não cria acordo nem registra aceite.

| Responsável pela decisão | Pendente | Evidência para a entrega documental |
| --- | --- | --- |
| Negócio | Indicar dono do modelo, fase em que o documento é emitido e fluxos de aprovação, correção e reemissão | Fluxo aprovado e responsável nominal |
| Negócio e jurídico | Definir modelo versionado, campos obrigatórios, fontes canônicas, formato de entrega e vigência de cada versão | Modelo aprovado e exemplo preenchido com dados fictícios |
| Jurídico | Definir quem pode assinar, representação das partes, modalidade de assinatura e o que comprova o aceite | Critérios de assinatura e aceite aprovados |
| Negócio, jurídico e equipe técnica | Definir vínculo entre versão emitida, acordo, signatários, comprovante e trilha de auditoria; definir acesso e guarda do documento | Critérios de homologação e registro da aprovação |

Essas decisões condicionam a emissão do **documento final**. A candidata P2 pode ser avaliada e publicada com o TXT explicitamente identificado como simulação.

## Evidências

A [homologação de retenção](easy-cob-p2-retencao.md) registra os controles de acesso, proteção de evidências e repetição de lote. O [ensaio de desempenho](easy-cob-p2-desempenho.md) registra p95 de 391 ms para prévia e 4,46 s para confirmação de 500 cobranças, além de recuperação de 92/92 perdas simuladas de resposta após commit. Esses números pertencem ao laboratório; o SLA do ambiente alvo continua em aberto.

Na preparação desta candidata, o build Next.js concluiu a compilação, a verificação TypeScript e a geração das 52 páginas estáticas. Os verificadores dos dois manifestos passaram. Os 15 testes selecionados cobriram publicação, Cap, Flow, cancelamento, Maestro, retenção e a regressão de importação da PR #45. Cinco ensaios em Chrome local com serviços simulados passaram, incluindo navegação por teclado, telas estreitas, consulta após interrupção e download do TXT sem criação de acordo.

O replay estrutural restaurou o dump local de schema de 19/11 em PostgreSQL 17.11 descartável em loopback. As nove versões ausentes desse dump (sete da P0/P1, PR #45 e P2) foram aplicadas na ordem esperada. A consulta de simulação de retenção retornou zero para Cap e Flow no banco sem dados de clientes. O estado atual do banco, do deploy e dos workers de produção será conferido na janela autorizada.

## Janela de publicação P2

Alvo conferido: **GKLI - COB** (`vjcmotflmcczoepflhwc`), com as sete versões P0/P1 e a migration do PR #45 instaladas. O CLI 2.117.0 executou o dry-run direcionado e aplicou somente `20261120000100_easy_retencao_previas.sql`, com `--project-ref vjcmotflmcczoepflhwc --skip-vault --yes`, sem seeds/roles. A instalação não executa retenção nem agenda cron. O resultado final da conferência de catálogo, SHA de merge e Production será registrado no PR #46.

Os 17 testes selecionados desta janela passaram, incluindo as fronteiras e a exclusão de cobrança; manifesto P2 e `git diff --check` passaram. O advisor de segurança manteve as mesmas contagens anteriores (25/2/27/1), sem novo apontamento relacionado à P2. Nenhuma importação, coleta de portal, retenção mutável, acordo ou envio foi executado nesta publicação.

O host local possui o supervisor `GKLI-Maestro-Supervisor`, com raiz `C:/Users/Gekali/gkli-cob`. A cópia de `espelhamento-fontes.ts` foi comparada em leitura com a main anterior e não contém divergências locais; `espelhamento-temporarios.mjs` ainda não existe nesse host. Após aprovação e publicação, distribuir apenas esses dois arquivos, preservando o anterior em backup operacional local e conferindo hashes. Não reiniciar o supervisor nem disparar jobs para validar: a comprovação da revisão carregada depende da próxima execução normal. O deploy web não comprova que essa execução ocorreu.

A emissão do documento final, o responsável/cadência da manutenção por carteira e os casos legados retidos continuam como pendências próprias, sem impedir a disponibilização da simulação TXT e das proteções instaladas.
