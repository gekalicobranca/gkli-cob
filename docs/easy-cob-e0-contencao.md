# Easy Cob — E0 e primeira contenção P0

Data: 18/11/2026. Referência: `871a57d4`. Branch: `codex/easy-p0-contencao`.
Worktree: `C:/Users/Gekali/gkli-cob-easy-p0`.

Evolução posterior: [P0-B transacional](easy-cap-p0b-transacional.md), implementado e testado localmente. O texto abaixo registra a contenção inicial; a suspensão permanece para prévias antigas e para a RPC destrutiva. O protocolo 2 usa o commit novo, sem publicação em produção.

## Escopo desta entrega

Preparação local e mapa de efeitos E0, suspensão do caminho destrutivo Easy Cap, bloqueio de novas execuções Easy Flow após resultado incerto e diagnóstico somente leitura. Esta entrega corresponde à preparação E0 e à primeira contenção PR-1 do plano; não conclui os P0-B/P0-C transacionais.

O checkout original `C:/Users/Gekali/gkli-cob` foi preservado. Ele apresenta 1.251 arquivos removidos e 24 modificados no início desta etapa. Foi criado worktree separado no mesmo HEAD, sem restaurar, limpar ou transportar os arquivos modificados do usuário. Especificação e plano produzidos neste chat foram copiados para o worktree para continuidade documental.

Dependências instaladas com `npm ci --ignore-scripts --offline --no-audit --no-fund`, usando o lockfile, sem alteração de versões. Confirmados Next.js 16.3.5, TypeScript 5.9.3 e PGlite 0.3.14. Não foram copiados `.env`, sessões de portal, vínculos de projeto Supabase ou configuração Vercel de outros worktrees.

Ambiente de verificação: Node e Postgres WASM/PGlite em memória, com fixtures sintéticas, sem banco remoto, providers ou credenciais. A aplicação Next não foi iniciada. Não houve teste navegador → API → Supabase completo nem levantamento do schema implantado. O ambiente executa verificações e testes locais; homologação integral requer stack local com migrations e serviços compatíveis.

## Mapa dos efeitos observado no baseline

| Percurso | Fronteira e efeitos | Garantia/limite |
| --- | --- | --- |
| Prévia Cap | `app/api/easy-cob/captacao/route.ts` lê/parser, snapshot e grava `conversoes_relatorio` com assinatura e operador | Não substitui cobranças; a gravação da prévia é distinta da confirmação |
| Confirmação Cap antiga | Route `conversao-relatorio/confirmar` → `easy_preparar_captacao` → `maestro_substituir_cobrancas_conversao` | Preparação tem transação/travas, mas confirma remoções/cancelamentos antes do loop HTTP de novas cobranças |
| Loop do importador | Cria unidades, complementa contatos, concilia/composição, insere cobranças e parcelas, saneamentos e pendências | Múltiplas chamadas independentes; falhas e interrupções podem deixar efeitos parciais |
| Finalização da conversão | Ranking/histórico do síndico, status e `preview_json` | Escritas posteriores aos dados; status final não integra a mesma transação global |
| Substituição Maestro nova | `maestro_substituir_captacao` concilia, cancela mensagens/filas e grava cobranças/parcelas na mesma RPC | Origem exclusiva `captacao_automatizada:*`; conjunto elegível diferente do Easy; unidades/contatos e finalização HTTP ainda exigem revisão |
| Plano Flow | `planejarEasyFlow` lê configuração, cobranças, acordos, canais e contatos; salva `easy_flow_execucoes` | Snapshot/hash não é uma trava global de todos os escritores |
| Claim e montagem Flow | Claim por status/parte → promove cobranças `novo` → `criarFlowsCobranca` | Claim, promoção e criação são commits separados |
| Motor de régua | `processarReguaCobranca` primeiro chama `liberarCobrancasRegulares`; depois cria lotes, mensagens, itens e eventos | Na chamada compartilhada atual, o condomínio não é passado ao motor; liberação inicial pode alcançar outras cobranças das carteiras. Revisar escopo no P0-C |
| Consolidação e vínculos | RPCs `email_consolidar_unidade` / `whatsapp_consolidar_unidade`, criação de Flow e updates de vínculo | RPCs individuais não tornam o percurso completo transacional; o ID do Flow pode não chegar à action em caso de exceção |
| Liberação Flow | Claim Easy → `enviarFlowCobranca` → `email_ativar_flow` → contador Easy | Ativação/agendamento no banco é separado do recibo/contador Easy. Resposta perdida não implica que a agenda não foi ativada |
| Providers | Workers/jobs posteriores consomem agenda/filas | Envio externo não pode ser revertido por rollback de banco; nada foi enviado nesta tarefa |
| Cancelamento | `cancelEasyAgreement`: upload privado e evento; depois `cancelarFormalizacaoAcordo` modifica acordo, termos, parcelas e cobranças | Storage e banco não têm transação conjunta; várias escritas do cancelamento são separadas, algumas sem conferência explícita de erro |

Arquivos revisados: actions/UI Easy; `features/easy-cob`; route completa de confirmação e seus pontos de escrita; criação/ativação de Flow; motor `features/regua/services/processar-regua-cobranca.ts` nos percursos de lote/mensagem/itens e helpers de consolidação; cancelamento compartilhado; migrations de substituição, execução Easy e ativação de Flow. Não foi executado nem certificado cada adapter de administradora ou cada trigger instalado remotamente.

## Matriz de preservação a fechar antes do commit transacional Cap

| Critério | Snapshot Easy atual | Referência Maestro nova | Decisão necessária |
| --- | --- | --- | --- |
| Ano | Corrente em São Paulo | Sem o mesmo filtro anual em `maestro_cobrancas_substituiveis` | Preservar a política anual Easy, salvo decisão de negócio explícita |
| Estados | `regular`, `novo`, `em_cobranca_ativa` | Mesmos estados iniciais, com verificações adicionais | Centralizar predicado usado no resumo e no commit |
| Acordos | Exclui vínculo direto e associativo | Também exclui ambos | Revalidar durante commit |
| Duplicadas | Exclui cópias e registros com dependentes | Também preserva vínculos protegidos | Testar matriz com IDs sintéticos |
| Pagamento/baixa | Snapshot Easy não lista todas as proteções financeiras | Verifica status financeiro, data/valor pago e `scanner_baixas` | Não adotar o snapshot simples como autorização de remoção |
| Arquivamento, judicial e automação | Snapshot Easy não explicita todos esses filtros | Predicado novo os exclui | Convergir resumo/commit para preservação segura e revisar efeito de compatibilidade |
| Blocos e consolidado | Substituição antiga possui regra específica Living | Helpers novos têm escopos/condições adicionais | Não generalizar o adapter ou trocar a origem da conversão |
| Mensagem em envio | Substituição antiga não tem a mesma barreira da nova | Substituição nova recusa mensagens/tentativas em envio | Bloquear commit conflitante e revalidar as reservas sob trava |

Estas diferenças justificam suspender a confirmação antiga em vez de redirecioná-la diretamente à RPC Maestro nova. A matriz é um contrato pendente de implementação/testes do P0-B, não autorização para alterar esses dados agora.

## Proteções implementadas

### Easy Cap

- Interface mantém leitura e prévia, informa suspensão e não oferece confirmação utilizável.
- API identifica Easy por origem **ou** marcador; remover `easy:true` do corpo não contorna a proteção.
- Após autorização por carteira/autor, confirmação nova retorna HTTP 503 com código `EASY_CAP_CONFIRMATION_PAUSED`. Conversão antiga concluída retorna reconhecimento sem executar novamente histórico ou importação.
- Ramo de chamada destrutiva Easy foi retirado do importador HTTP. Demais caminhos de importação não foram redirecionados para o Easy.
- Migration substitui `easy_preparar_captacao` por recusa explícita, mantendo revogações/grants. Não deixa uma cópia executável de fallback.
- Novo GET `/api/easy-cob/captacao/status?conversaoId=<uuid>` exige autenticação, papel, carteira e autoria; retorna apenas ID, estado, instante e classificação. Não chama parser, importador, Storage ou funções de histórico. Usa `private, no-store`.
- `falha`, `cancelado`, `processando` e estados desconhecidos são classificados como exigindo conferência. Prévia significa ausência de aplicação confirmada; não inventa contadores para conversões antigas.

### Easy Flow

- Índice único passa a incluir `atencao`; uma execução incerta continua reservando o condomínio.
- Preflight da migration aborta diante de sobreposição histórica, sem apagar ou alterar execuções.
- Busca de execução pendente ocorre antes de carregar régua/SMTP/agente atuais. Configuração alterada não oculta resultado incerto do próprio operador.
- Operador diferente recebe bloqueio sem obter os dados da execução alheia. A consulta por ID continua validando carteira e autor.
- Nova preparação devolve a execução bloqueante existente. Corridas de inserção são contidas pelo índice, após a migration.
- Preparação, montagem e liberação novas exigem `easy_p0_contencao_versao() = 1`. Migration ausente/incompatível bloqueia escrita; não existe fallback silencioso.
- UI bloqueia repetição após erro de transporte/action até consulta de andamento bem-sucedida; evita duplo clique enquanto há mutação e trata falha da própria consulta.
- `atencao` não oferece “Nova operação”. Consulta mostra ID/estado/atualização, sem exibir o texto interno do erro persistido.

Não foram criadas ações para limpar atenção, forçar liberação ou adivinhar vínculos históricos. Nova tentativa de montagem/liberação de execução já reivindicada continua condicionada ao estado persistido; não há retomada automática por tempo decorrido.

## Migration preparada, não aplicada a ambiente externo

Arquivo: `supabase/migrations/20261118205314_easy_p0_contencao.sql`, criado por `supabase migration new easy_p0_contencao`.

Efeitos: preflight → troca do índice único parcial → suspensão da RPC Easy → função de versão restrita ao servidor. Tudo na mesma transação. RLS existente é preservada, sem novos grants para papéis públicos, novas credenciais ou novas tabelas operacionais.

A versão garante presença da contenção nesta migration; não é um atestado completo do schema nem protege operações manuais privilegiadas. Não copiar chave administrativa para o navegador. O aplicativo atualizado depende da migration para novas mutações Flow.

Uma implantação futura exige interromper/drenar requests antigos de confirmação: trocar código não interrompe uma requisição que já ultrapassou o ponto destrutivo. Se o preflight falhar, não resolver apagando registros ou reduzindo a proteção do índice. Conferir a sobreposição no ambiente autorizado e preparar resolução auditada.

## Verificação local

Comandos reproduzíveis no worktree:

```powershell
npm run test:easy-p0
npm run typecheck
```

O teste usa PGlite/Postgres em memória e fronteiras reais de routes/actions carregadas em VM com dependências explicitamente simuladas. Dependência não autorizada provoca falha no teste; nenhum teste cria cliente remoto. A fixture inclui estruturas originais de execução Easy, papéis de banco e um registro financeiro sentinela, sem dados reais.

Cobertura nova: atenção e exclusão mútua por constraint; terminal/outro condomínio; recusa da migration com conflitos e rollback do DDL; suspensão da RPC sem tocar a sentinela; permissões públicas; confirmação HTTP sem mutação; carteira/autor/perfil no diagnóstico; diagnóstico Flow sem configuração válida; recusa de mutação sem a versão de banco; devolução da execução existente antes de planejar outra.

Limites: PGlite serializa sua conexão; duas promessas provam constraint e resultado de tentativas, não concorrência entre sessões Postgres reais. Os mocks de fronteira verificam autorização/controle de fluxo, não equivalência completa do schema Supabase. Não houve browser, build com `prebuild` de snapshot, jobs, SMTP, WhatsApp, consultas de portal, comandos linked ou deploy.

Resultados registrados nesta entrega:

- `npm run test:easy-p0`: 9 testes passaram.
- `node node_modules/tsx/dist/cli.mjs --test scripts/validate-easy-flow.ts scripts/validate-easy-captacao.ts`: 6 testes existentes passaram. Esses testes exercitam também migrations históricas em fixtures; não representam a aplicação da cadeia completa do schema.
- ESLint dirigido aos 12 arquivos TypeScript/TSX alterados/adicionados: sem erros ou avisos.
- `npm run typecheck`: passou, incluindo os novos testes e contratos.
- `git diff --check`: sem problemas de whitespace. `package-lock.json` preservado.

## Pendências e próxima etapa

1. [P0-B](easy-cap-p0b-transacional.md) implementado localmente: plano preparado e commit transacional, incluindo unidades/contatos e conclusão.
2. [P0-C](easy-flow-p0c-transacional.md) implementado localmente: ledger por parte, montagem/liberação em transação e reconciliação por evidências. A posse passou a ser transacional, sem trabalhador mutável fora da transação; a promoção própria não invalida partes posteriores.
3. O P0-C adiciona reservas e guards no banco para mensagens/itens dos percursos compartilhados. Corrida com painel/Maestro entre sessões reais ainda precisa de homologação; não inferir proteção operacional publicada a partir das fixtures.
4. Runs legados ou com evidência divergente seguem bloqueantes. O reconciliador novo recupera recibos e projeções sem atribuir artefatos por aproximação ou reenviar mensagens.
5. Antes de produção: stack/schema compatíveis, corrida entre sessões reais, ensaios de interrupção e rollout autorizado. Nenhuma proteção desta branch foi publicada ou aplicada em produção.

Não reabilitar o caminho destrutivo com flag de ambiente para contornar a suspensão. Reabilitação Easy Cap depende do commit transacional e seus testes. Reversão deve preservar diagnósticos e chaves/estados; não deve reabrir a repetição insegura.
