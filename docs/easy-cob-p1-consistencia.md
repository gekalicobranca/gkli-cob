# Easy Cob — P1 de consistência operacional

Estado em 19/11/2026: implementação local na branch `codex/easy-p1-consistencia`, worktree `gkli-cob-easy-p0`, baseada no candidato P0 `6642cad2`. Não publicada. Nenhuma migration remota, worker, job ou envio foi executado nesta etapa. O checkout original do usuário foi preservado.

## Entrega

| Frente | Comportamento implementado |
| --- | --- |
| Cancelamento | `features/acordos/cancelamento-server.ts` e RPC `acordo_cancelar_formalizacao_atomico` concentram acordo, termos, parcelas, cobranças elegíveis, filas, documento, auditoria e recibo na mesma transação. Pagamento parcial, renegociação e tentativa de envio incerta impedem cancelamento. Cobranças pagas, judiciais, bloqueadas ou vinculadas a outro acordo ativo não são forçadas à operação. |
| Anexo | PDF privado, limitado e validado, usa o repositório existente `acordo_documentos` na mesma transação. Esta decisão substitui o staging em Storage proposto no plano: rollback também remove o documento, eliminando órfãos deste percurso. Download usa a API autenticada existente. Link só aparece após recibo confirmado. |
| Maestro | Prévia mostra captação, montagem e possível ativação automática. Pedido guarda ator, seleção, efeitos e versão de configuração. Replay retorna o recibo; mudança de configuração bloqueia execução/montagem/ativação incompatível. Jobs Easy legados sem consentimento não recebem autorização retroativa. |
| Pag | Distingue fila, consulta e confirmação encontrada; mostra corte e encaminha ao acordo para conciliação. Não baixa parcelas nem afirma inadimplência pela ausência de confirmação. |
| Workers | Metadados de heartbeat, fila, idade, processamento, tentativas e último sucesso/falha. Limiar `EASY_WORKER_HEARTBEAT_MAX_SECONDS` entre 30 e 3600 segundos, padrão 360. Ausência de sinal não prova worker desligado. Worker Pag sob demanda registra heartbeat durante sua execução. |
| Recuperação | `/app/configuracoes/easy/flow/recuperacao` exige admin/gestor, carteira, motivo e versão. Usa reconciliador P0, registra solicitante e autor original, recompõe projeções por evidência. Não agenda, reenvia, apaga histórico ou infere vínculos legados. Autor original sem autorização impede reconciliação; não há tomada de posse implícita. |
| Segurança | RPCs operacionais privadas para service role, escopo validado no banco e actions autenticadas. Painéis não expõem erros brutos de portais ou configuração sensível. Elegibilidade de cancelamento compartilhada nos atalhos Easy e GKLI. |

## Migrations e dependências

Aplicar somente em implantação separadamente autorizada, depois da cadeia P0 e das estruturas existentes de documentos, Maestro e scanners:

1. `20261119204222_acordo_cancelamento_transacional.sql`
2. `20261119205321_easy_maestro_consentimento.sql`
3. `20261119205324_easy_recuperacao_administrativa.sql`
4. `20261119205728_easy_saude_workers.sql`

Maestro preserva os corpos atuais das funções compartilhadas e injeta a validação Easy nos pontos de montagem; a migration falha se não localizar o contrato esperado. A ativação recebe wrapper sem remover as proteções anteriores. O snapshot de backup local deve acompanhar as quatro migrations.

## Verificação e limites

Os 20 testes dirigidos P1 passaram em PGlite e nas fronteiras de actions/componentes: rollback em documento/timeline/auditoria/recibo, resposta perdida, bloqueios financeiros, grants/carteira, consentimento/configuração, recuperação e textos operacionais. Comandos reproduzíveis: `npm run test:easy-p1-cancelamento` e `npm run test:easy-p1-operacional` (ou `npm run test:easy-p1`). Workers não são iniciados pelos testes.

Após a revisão React, os dois testes de fronteira Maestro passaram novamente. As verificações ampliadas de ativação permitida e gestor sem carteira também passaram. Typecheck passou; ESLint dos arquivos TypeScript alterados/novos passou, assim como `node --check scripts/scanner/easy-pague-worker.mjs` e `git diff --check`.

A regressão de negócio P0 passou com 63 testes (Cap, Flow, contenção, planilhas e fronteiras), sem o manifesto exclusivo da publicação P0. Os tempos observados nesta máquina não representam SLA de produção.

`npm run build` passou (Next.js 16.3.5, compilação, TypeScript e geração de páginas). O prebuild gerou apenas o snapshot local de 318 arquivos de schema; nenhuma migration foi aplicada. As rotas de recuperação e de download autenticado constam no build.

Em 19/11/2026 passaram cinco disputas em PostgreSQL nativo 18.7 no Windows com dados sintéticos. Duas sessões executaram as operações e uma terceira confirmou a espera entre os PIDs via `pg_blocking_pids` antes do commit. Pagamento primeiro impediu o cancelamento. Cancelamento primeiro gerou um recibo e impediu pagamento tardio. O claim do Maestro inicialmente passou sem aguardar uma edição de configuração em curso. A correção adquire travas SHARE nas tabelas que alimentam o consentimento antes de revalidar. No reteste o worker esperou e o pedido permaneceu pendente. Tanto montagem quanto liberação invalidaram a versão administrativa da recuperação concorrente. A agenda terminou com zero e uma mensagem, respectivamente. Os oito testes operacionais P1 também passaram após a correção.

Para reproduzir no Windows x64, instalar `embedded-postgres@18.7.0-beta.19` em diretório temporário com `npm install --prefix <diretorio> embedded-postgres@18.7.0-beta.19`. No worktree executar `node --import tsx scripts/validate-easy-p1-postgres.mjs <diretorio>`. O roteiro cria clusters em loopback com senhas aleatórias. A homologação cobre estas disputas em READ COMMITTED com o usuário do laboratório. Ainda cabe verificar a cadeia histórica completa do Supabase, os papéis do ambiente final e a duração das travas com carga representativa.

O manifesto de publicação P0 permanece congelado em três migrations; o teste exclusivo desse manifesto não deve ser usado como manifesto da P1 nem enfraquecido para aceitar escopo novo. A P0 está associada ao PR #40, ainda draft/não integrado na última evidência, com publicação Vercel bloqueada por `Account is blocked`; isso não comprova aplicação remota da P0. P1 depende de resolver essa implantação e de nova autorização concreta para publicação.

Em incidente, bloquear novas mutações e preservar recibos/consultas. Não restaurar o antigo cancelamento com múltiplas escritas nem apagar documentos, eventos ou migrations para desfazer efeitos já confirmados.

## Replay histórico e medição das travas em 19/11/2026

O replay ordenado das 317 migrations do worktree em PostgreSQL 17.11 vazio terminou na primeira, `20260609180000_administradoras_acesso_gerar_acordo.sql`, com SQLSTATE 42P01. O índice depende de `public.administradoras`. O SQL legado de maio também pressupõe essa tabela. As 317 versões têm 14 dígitos e são únicas. O Git e os arquivos locais examinados não forneceram a base de schema anterior a 09/06. O dump local encontrado é de setembro. A cadeia permanece sem homologação integral.

O ensaio de carga usou outro banco descartável no mesmo cluster, com a fixture operacional, as funções P1 e captação sintética. Foram 500 condomínios com receitas, 31 réguas, 156 etapas e 100 templates sintéticos. Quatro sessões emitiram pedidos em paralelo. Depois quatro workers assumiram uma execução por pedido, concorrendo com uma atualização do controle que preservava seu valor. Cada combinação teve oito rodadas e 32 observações. A seleção de 500 representa o limite da RPC. O histórico de execuções cresceu entre cenários. Os volumes são hipóteses de laboratório.

| Seleção | Operação | Espera p50 / p95 / máx (ms) | Retenção p50 / p95 / máx (ms) |
| ---: | --- | ---: | ---: |
| 10 | Pedido | 32,7 / 147,9 / 220,2 | 19,0 / 75,6 / 76,8 |
| 10 | Claim | 0,12 / 0,23 / 0,25 | 16,0 / 21,0 / 21,4 |
| 100 | Pedido | 31,9 / 88,4 / 106,5 | 29,4 / 34,5 / 39,7 |
| 100 | Claim | 0,11 / 0,16 / 0,30 | 23,3 / 31,9 / 32,7 |
| 500 | Pedido | 265,4 / 715,1 / 977,5 | 219,4 / 282,4 / 326,9 |
| 500 | Claim | 0,17 / 1,13 / 1,65 | 122,4 / 148,6 / 162,0 |

Instrumentação apenas no banco descartável, com relógio do servidor. A espera dos pedidos começa antes da trava consultiva global e termina após adquirir o conjunto de travas de tabela. A espera dos claims abrange a aquisição das travas SHARE. A retenção vai da aquisição do conjunto até o timestamp do commit, incluindo a consulta de instrumentação antes do commit. No lote de 500, o p95 de aquisição das tabelas isoladamente foi 0,45 ms para pedidos. A fila da trava consultiva concentrou a espera. Não houve timeout nas 192 operações medidas. A captação mensal é simulada e a máquina não foi calibrada com telemetria de produção.

Para reproduzir no Windows com os binários locais do PostgreSQL 17 e um diretório de dependências contendo o pacote npm `pg`, executar `node --import tsx scripts/validate-easy-p1-cadeia-carga.mjs <diretorio-bin-postgres> <diretorio-de-dependencias>`. O código de saída não zero sinaliza falha do replay mesmo quando a medição termina. O roteiro usa loopback, porta e senha aleatórias, e encerra o cluster ao concluir.

Busca do schema histórico nos backups em 19/11/2026. O destino configurado no GitHub é a pasta GKLI Backups/production do Google Drive. Pela montagem local, a pasta GKLI Backups contém nove pacotes diários de 11 a 19/11/2026 e nove checksums. A pasta alternativa backup gkli está vazia. A busca por nomes de dumps, schemas e arquivos de backup no perfil local, em cópias do projeto e nos índices das contas DriveFS não identificou um schema GKLI Cob anterior à migration inicial. O dump local de setembro e os pacotes de novembro são posteriores. O workflow versionado de backup aparece no histórico a partir de julho. A busca não recuperou uma base com procedência e data adequadas para reaplicar a cadeia desde junho. Nenhum pacote foi restaurado e o replay integral permanece pendente.

Busca complementar de réplica ou exportação descriptografada de 19/11/2026. O catálogo da conexão Supabase Cob apresentou um único projeto e nenhuma branch de desenvolvimento. A inspeção foi restrita a metadados administrativos. O cluster local homologacao-runtime estava desligado, com último checkpoint de 02/11 às 17h02. Os clusters easy-concorrencia pertenciam aos ensaios sintéticos. Não foi identificado um par verificável de schema e histórico de migrations do mesmo snapshot nas exportações locais, nos índices disponíveis do Drive ou nos artefatos acessíveis do repositório. O dump palacio-debug é de setembro e o schema gkli-colab pertence a outro projeto. O pacote criptografado de 19/11 continua sendo a cópia datada conhecida. Nenhuma migration foi aplicada nesta investigação.

## Atualização a partir do schema atual de produção, 19/11/2026

Homologação estrutural aprovada no worktree easy-p0. Uma transação REPEATABLE READ READ ONLY no projeto GKLI Cob forneceu o snapshot exportado para pg_dump --schema-only e a consulta de version/name de supabase_migrations.schema_migrations. O arquivo customizado não contém TABLE DATA, SEQUENCE SET ou BLOBS. Foram excluídos comentários, rótulos de segurança, publicações e assinaturas de replicação. Exportação privada fora do Git, em %LOCALAPPDATA%/GKLI/easy-p1-schema-20261119 (schema.dump e history.json). SHA-256 do dump 548a2fed2f52a9116f93330e0d3d401fc1169af256a50c35b221bbff3dbaefc2.

Produção registrava 311 versões. Das 317 migrations locais, 310 coincidiam em versão e nome. A versão adicional de produção 20261119205808 (importacao_ausentes_preservar_acordos_judicializadas) foi preservada tanto no schema quanto no histórico local. Seleção por diferença de versões, independentemente da data da última aplicada.

Em PostgreSQL 17.11 descartável em loopback foram restaurados os objetos dos schemas public, auth, storage, extensions, supabase_migrations, gkli_core, gkli_flex e colaborador_area utilizados na validação, com papéis locais e extensões disponíveis. Componentes gerenciados, workers, replicação, event triggers e default ACLs ficaram fora do ensaio. Foram executados em ordem os arquivos 20261118205314, 20261118211109, 20261118220528, 20261119204222, 20261119205321, 20261119205324 e 20261119205728. Os sete terminaram sem erro. O histórico do laboratório chegou às 318 versões esperadas e as relações acordo_cancelamentos, easy_maestro_pedidos, easy_flow_partes e easy_captacao_resultados estavam presentes. O cluster foi encerrado e removido.

O resultado valida a instalação sobre o DDL exportado. Conflitos ou precondições dependentes das linhas existentes, equivalência integral das permissões da plataforma e execução com dados reais estão fora deste ensaio. Nenhuma migration ou mutação foi executada em produção.

## Precondições de dados em produção — 19/11/2026, 18h54min53s (Brasília)

Uma transação PostgreSQL REPEATABLE READ READ ONLY, com leitura confirmada como on e encerrada com ROLLBACK, retornou exclusivamente contagens e o tamanho máximo de chaves. Nesse snapshot, zero das sete versões constavam no histórico. Não foram retornados identificadores, payloads, observações, contatos ou registros individuais.

| Migration | Verificação sobre os dados existentes | Resultado |
| --- | --- | --- |
| 20261118205314 — contenção | Mesmo filtro de seis estados e agrupamento por condomínio do preflight da migration | 15 execuções históricas, 1 aberta, 0 grupos conflitantes e 0 execuções em conflito. |
| 20261118211109 — Easy Cap | Avaliação da expressão do índice não único em todas as cobranças | 21.756 linhas, 21.030 identidades não nulas, maior identidade de 27 bytes. A expressão terminou sem erro. |
| 20261118220528 — Flow | Predicado JSON e pares de chaves dos dois índices únicos, respeitando a semântica de NULL do PostgreSQL | 0 flows e 0 itens no predicado. Em cada índice, 0 grupos duplicados. As 15 execuções existentes receberiam protocolo 1, incluindo a aberta. |
| 20261119204222 — cancelamento | Tabela de recibos criada vazia, FKs e unicidade sobre os novos recibos. Trigger de pagamentos atua em escritas futuras | Nenhuma validação retroativa ou backfill sobre acordos/parcelas existentes. Elegibilidade de cada cancelamento é verificada no momento da operação. |
| 20261119205321 — consentimento Maestro | Execuções Easy com lote anterior ao novo registro de consentimento e filas de montagem/ativação | 66 execuções legadas, 2 pendentes, 0 em execução, 0 montagens pendentes/processando e 0 ativações automáticas Easy pendentes. Os 2 pedidos pendentes ficam impedidos de iniciar pelo novo caminho sem consentimento registrado. |
| 20261119205324 — recuperação | Índice parcial único sobre nova coluna operacao_id | A coluna nasce NULL e só valores não nulos entram no índice. Nenhuma chave preexistente a deduplicar. A execução Flow legada aberta exige revisão se precisar de recuperação pelo protocolo novo. |
| 20261119205728 — saúde dos workers | Contagem de consultas Pag por estado, sem backfill de finalizado_em | 72 consultas, sendo 33 concluídas/com falha e 39 em fila/consulta. As 33 finalizadas não ganham horário retroativo. |

Nenhum bloqueio de dados à aplicação do DDL foi identificado nesse snapshot. Há impacto operacional em dois pedidos Maestro pendentes e uma execução Easy Flow aberta no protocolo legado. As contagens podem mudar com o uso do sistema, inclusive entre a conferência e uma implantação. Nenhuma migration, reconciliação, alteração de fila ou cópia de registros de clientes foi executada.
