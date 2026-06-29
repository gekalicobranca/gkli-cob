# Especificacao - Inbox operacional e agente de automacao para GKIT Jur

## 1. Objetivo

Esta especificacao descreve um modelo reaproveitavel de Inbox operacional e agente de automacao inspirado no GKLI Cob, adaptado para o contexto do `gkit-jur`.

O objetivo e criar uma fila unica de trabalho juridico, priorizada por risco, prazo, impacto e pendencias, conectada a um agente de automacao capaz de coletar informacoes, preparar tarefas e registrar evidencias sem substituir a validacao humana em etapas sensiveis.

## 2. Principios do produto

- O Inbox e a tela inicial da operacao diaria.
- O operador nao deve procurar trabalho; o sistema deve trazer o que precisa de acao.
- Automacao cria, classifica, coleta e sugere; decisoes juridicas e atos sensiveis permanecem com validacao humana.
- Toda acao relevante deve gerar evento/auditoria.
- O mesmo item pode aparecer em listas diferentes, mas deve ter uma unica fonte operacional de status.
- O agente deve trabalhar por receitas configuraveis, com logs, arquivos, validacoes e retries.
- O Inbox deve separar claramente pendencia, prazo, publicacao, processo, documento e tarefa interna.

## 3. Perfis e permissoes

### Perfis sugeridos

| Perfil | Escopo | Pode fazer |
| --- | --- | --- |
| Admin | Todas as areas | Configurar automacoes, usuarios, fontes e regras |
| Gestor juridico | Carteiras/equipes vinculadas | Priorizar filas, redistribuir itens, revisar indicadores |
| Advogado | Processos/carteiras vinculadas | Atuar em prazos, publicacoes, tarefas e documentos |
| Assistente | Processos/carteiras vinculadas | Triagem, saneamento, juntada, minuta e acompanhamento |
| Leitura | Escopo vinculado | Consultar sem executar acoes sensiveis |
| Agente | Service role / worker | Executar receitas tecnicas, nunca decidir sozinho |

### Regras

- Todo item do Inbox deve respeitar escopo por carteira, equipe, cliente ou unidade juridica.
- Acoes automaticas devem ser bloqueaveis por processo, cliente, tipo de tarefa ou regra de compliance.
- Perfis humanos veem apenas itens do escopo permitido.
- O agente so escreve em tabelas controladas de execucao, arquivos, logs, eventos e pendencias derivadas.

## 4. Conceito do Inbox

O Inbox e uma fila operacional consolidada. Ele agrega fontes distintas e transforma tudo em itens acionaveis.

### Fontes de entrada

| Fonte | Exemplos em GKIT Jur | Resultado no Inbox |
| --- | --- | --- |
| Publicacoes | DJe, e-SAJ, PJe, Projudi, eproc | Triar publicacao, vincular processo, gerar prazo |
| Prazos | Contestacao, recurso, manifestacao, audiencia | Cumprir prazo, revisar responsavel |
| Processos | Movimentacoes, situacoes criticas, sem andamento | Acompanhar, peticionar, atualizar estrategia |
| Documentos | Documento pendente do cliente, comprovante, procuracao | Solicitar, validar, anexar |
| Pendencias internas | Cadastro incompleto, processo sem advogado, cliente sem contato | Sanear cadastro ou redistribuir |
| Automacoes | Coleta falhou, captcha, 2FA, arquivo rejeitado | Intervir, validar, reexecutar |
| Tarefas manuais | Revisao de minuta, aprovacao, envio | Executar tarefa atribuida |

### Filas padrao

| Fila | Descricao | Ordenacao sugerida |
| --- | --- | --- |
| Hoje | Melhor fila para iniciar o dia | Maior score, prazo proximo, prioridade alta |
| Criticos | Risco processual, prazo vencendo, bloqueio grave | Risco juridico desc, vencimento asc |
| Prazos | Itens com data fatal ou compromisso | Data limite asc |
| Publicacoes | Publicacoes novas ou em triagem | Data publicacao desc, risco desc |
| Pendencias | Travas operacionais abertas | Prioridade desc, prazo asc |
| Automacao | Intervencoes do agente | Status, tentativas, severidade |
| Sem retorno | Itens sem movimentacao humana recente | Dias sem interacao desc |

## 5. Item padrao do Inbox

Todo item apresentado no Inbox deve ser normalizado para um contrato unico:

| Campo | Tipo | Descricao |
| --- | --- | --- |
| `id` | uuid/text | ID do registro de origem ou item consolidado |
| `tipo` | enum | `processo`, `prazo`, `publicacao`, `documento`, `pendencia`, `automacao`, `tarefa` |
| `origem` | text | Fonte do item |
| `titulo` | text | Texto principal exibido |
| `subtitulo` | text | Contexto: cliente, processo, parte, vara, comarca |
| `status` | text | Status operacional atual |
| `prioridade` | enum | `critica`, `alta`, `media`, `baixa` |
| `score` | number | Pontuacao de 0 a 100 |
| `data_referencia` | date/timestamptz | Prazo, publicacao, vencimento ou ultima movimentacao |
| `responsavel_id` | uuid nullable | Usuario responsavel, se houver |
| `equipe_id` | uuid nullable | Equipe responsavel |
| `carteira_id` | uuid nullable | Escopo operacional |
| `entidade_tipo` | text | Tipo da entidade vinculada |
| `entidade_id` | uuid/text | ID da entidade vinculada |
| `acao_label` | text | Verbo da proxima acao |
| `acao_url` | text | Destino clicavel |
| `motivo` | text | Explicacao curta da recomendacao |
| `payload` | jsonb | Dados extras especificos da origem |

## 6. Regras de prioridade

### Score sugerido

O score deve combinar fatores objetivos:

| Fator | Peso sugerido | Exemplo |
| --- | --- | --- |
| Prazo processual | ate 40 | Prazo vence hoje ou amanha |
| Risco juridico | ate 25 | Revelia, preclusao, liminar, penhora |
| Impacto financeiro/cliente | ate 15 | Valor da causa, cliente estrategico |
| Idade sem interacao | ate 10 | Sem toque humano ha 7 dias |
| Origem automatica com falha | ate 10 | Coleta com 3 tentativas falhas |

### Conversao para prioridade

| Score | Prioridade |
| --- | --- |
| 85-100 | Critica |
| 65-84 | Alta |
| 40-64 | Media |
| 0-39 | Baixa |

### Regras especiais

- Prazo vencendo hoje nunca pode ficar abaixo de alta.
- Prazo vencido deve ser critico ate ser resolvido ou justificado.
- Publicacao nao triada deve subir de prioridade conforme idade.
- Falha de automacao bloqueante deve virar pendencia humana.
- Item com automacao bloqueada nao pode disparar acao automatica, mas continua aberto para acao manual.

## 7. Tela do Inbox

### Cabecalho

Deve exibir:

- Nome da area: Inbox operacional.
- Texto curto sobre o objetivo da fila.
- Acoes rapidas: processos, prazos, publicacoes, automacoes, agenda.

### KPIs

KPIs recomendados:

| KPI | Descricao |
| --- | --- |
| Fila do dia | Quantidade de itens recomendados para hoje |
| Criticos | Itens com risco real |
| Prazos proximos | Prazos vencendo em ate 3 dias uteis |
| Automacoes pendentes | Execucoes com falha, intervencao ou validacao |
| Pendencias abertas | Travas operacionais nao resolvidas |

### Layout

Modelo recomendado:

1. Coluna esquerda: filas inteligentes.
2. Centro: lista acionavel.
3. Coluna direita: painel de contexto, melhor proxima acao e alertas.

### Item da lista

Cada item deve mostrar:

- Posicao na fila.
- Prioridade.
- Status.
- Origem.
- Titulo.
- Subtitulo.
- Proxima acao.
- Data de referencia.
- Score visual.
- Link direto para a entidade acionavel.

## 8. Proximas acoes

O Inbox deve calcular sugestoes globais para orientar o operador.

Exemplos para GKIT Jur:

| Condicao | Sugestao |
| --- | --- |
| Publicacoes novas nao triadas | Abrir triagem de publicacoes |
| Prazos criticos proximos | Revisar prazos criticos |
| Processos sem responsavel | Atribuir responsavel |
| Documentos pendentes | Solicitar documento ao cliente |
| Automacao com falha | Revisar execucao do agente |
| Minutas aguardando revisao | Abrir fila de revisao |

## 9. Pendencias operacionais

Pendencias sao travas ou tarefas que precisam de intervencao humana.

### Campos sugeridos

| Campo | Tipo |
| --- | --- |
| `id` | uuid |
| `carteira_id` | uuid nullable |
| `processo_id` | uuid nullable |
| `cliente_id` | uuid nullable |
| `tipo` | text |
| `origem` | text |
| `titulo` | text |
| `descricao` | text |
| `prioridade` | enum |
| `status` | enum |
| `responsavel_id` | uuid nullable |
| `prazo_limite` | timestamptz nullable |
| `entidade_tipo` | text nullable |
| `entidade_id` | uuid/text nullable |
| `payload` | jsonb |
| `created_at` | timestamptz |
| `resolved_at` | timestamptz nullable |

### Status

- `aberta`
- `em_tratamento`
- `aguardando_terceiro`
- `resolvida`
- `cancelada`

### Tipos juridicos iniciais

- `publicacao_nao_vinculada`
- `prazo_sem_responsavel`
- `documento_obrigatorio_ausente`
- `processo_sem_cliente`
- `processo_sem_advogado`
- `automacao_falha_login`
- `automacao_captcha_2fa`
- `arquivo_coletado_aguardando_validacao`
- `minuta_aguardando_revisao`
- `audiencia_sem_preparacao`

## 10. Agente de automacao

O agente e uma camada de execucao assistida. Ele deve operar por receitas, registrar tudo e exigir validacao humana quando houver risco.

### Objetivos do agente

- Coletar publicacoes, movimentacoes, documentos e relatórios.
- Criar execucoes rastreaveis.
- Registrar arquivos coletados.
- Classificar resultados.
- Abrir pendencias quando houver falha.
- Preparar dados para importacao ou atualizacao.
- Nunca praticar ato juridico sem autorizacao humana.

### Entidades do agente

| Entidade | Descricao |
| --- | --- |
| `agente_fontes` | Sistemas externos: tribunais, diarios, portais, e-mails, APIs |
| `agente_credenciais` | Credenciais por fonte, cliente, carteira ou usuario tecnico |
| `agente_receitas` | Roteiros de coleta/execucao |
| `agente_execucoes` | Instancias de execucao do agente |
| `agente_arquivos` | Arquivos baixados ou gerados |
| `agente_logs` | Logs passo a passo |
| `agente_validacoes` | Validacao humana de arquivos/dados |
| `agente_resultados` | Resultado estruturado da coleta |

### Receita

Uma receita define o que o agente deve fazer.

Campos sugeridos:

| Campo | Descricao |
| --- | --- |
| `nome` | Nome operacional |
| `tipo_coleta` | `publicacao`, `movimentacao`, `documento`, `prazo`, `andamento`, `email` |
| `fonte_id` | Fonte externa |
| `periodicidade` | `manual`, `diaria`, `horaria`, `semanal` |
| `script_key` | Identificador tecnico do worker |
| `tipo_arquivo_esperado` | `html`, `pdf`, `xlsx`, `csv`, `json`, `zip` |
| `config_json` | Parametros da receita |
| `ativo` | Se a receita pode executar |

### Execucao

Status sugeridos:

- `pendente`
- `em_execucao`
- `sucesso`
- `falha`
- `precisa_intervencao`
- `aguardando_validacao`
- `cancelada`

Campos importantes:

- `receita_id`
- `fonte_id`
- `carteira_id`
- `processo_id`
- `status`
- `solicitado_por`
- `iniciado_em`
- `finalizado_em`
- `erro_mensagem`
- `tentativas`
- `payload`

### Validacao humana

Toda coleta que altere processo, prazo, publicacao ou documento deve passar por validacao quando:

- fonte nao for 100% confiavel;
- houver divergencia de processo/parte;
- arquivo vier sem assinatura, sem data ou ilegivel;
- resultado criar prazo fatal;
- agente encontrou captcha/2FA;
- houve baixa parcial ou coleta incompleta.

Status de validacao:

- `aguardando_validacao`
- `validado`
- `rejeitado`
- `reenviar_coleta`
- `importado_manual`

## 11. Fluxos principais

### 11.1 Inicio do dia pelo Inbox

1. Usuario abre o Inbox.
2. Sistema calcula filas por escopo.
3. Sistema destaca itens de hoje, criticos e prazos.
4. Usuario abre item acionavel.
5. Usuario executa acao no modulo de origem.
6. Sistema registra evento e remove/rebaixa item quando resolvido.

### 11.2 Publicacao nova

1. Agente coleta publicacao.
2. Sistema tenta vincular a processo existente.
3. Se vincular com confianca alta, cria item de triagem.
4. Se nao vincular, cria pendencia `publicacao_nao_vinculada`.
5. Usuario valida.
6. Se houver prazo, sistema cria prazo e item no Inbox.

### 11.3 Prazo critico

1. Prazo entra no Inbox conforme data fatal.
2. Score sobe automaticamente conforme proximidade.
3. Se faltar responsavel, cria pendencia.
4. Usuario abre prazo/processo.
5. Conclusao exige evento: cumprido, prorrogado, redistribuido ou justificado.

### 11.4 Falha do agente

1. Execucao falha por login, captcha, 2FA, indisponibilidade ou erro de parser.
2. Agente registra log e erro.
3. Sistema cria pendencia de automacao.
4. Inbox mostra a pendencia em Automacao/Criticos conforme severidade.
5. Usuario corrige credencial, libera 2FA ou solicita reexecucao.

### 11.5 Arquivo coletado

1. Agente baixa arquivo.
2. Arquivo e registrado em `agente_arquivos`.
3. Sistema calcula hash, tipo, origem e metadados.
4. Usuario valida.
5. Resultado validado alimenta processo, documento, publicacao ou prazo.

## 12. Eventos e auditoria

Toda acao sensivel deve registrar evento.

Eventos minimos:

- `inbox_item_aberto`
- `pendencia_criada`
- `pendencia_iniciada`
- `pendencia_resolvida`
- `prazo_criado`
- `prazo_cumprido`
- `publicacao_triagem_validada`
- `agente_execucao_criada`
- `agente_execucao_iniciada`
- `agente_execucao_falhou`
- `agente_arquivo_validado`
- `agente_arquivo_rejeitado`
- `automacao_bloqueada`
- `automacao_reexecutada`

Campos:

- `user_id`
- `origem`
- `entidade_tipo`
- `entidade_id`
- `acao`
- `descricao`
- `antes`
- `depois`
- `payload`
- `created_at`

## 13. Modelo de dados sugerido

### Tabelas centrais

- `jur_inbox_itens` ou view materializada equivalente.
- `jur_pendencias`
- `jur_prazos`
- `jur_publicacoes`
- `jur_processos`
- `jur_tarefas`
- `jur_eventos_operacionais`
- `jur_automacoes`
- `jur_automacoes_execucoes`
- `agente_fontes`
- `agente_credenciais`
- `agente_receitas`
- `agente_execucoes`
- `agente_arquivos`
- `agente_logs`
- `agente_validacoes`

### Estrategia recomendada

No MVP, evitar criar uma tabela fisica unica de Inbox se as fontes ainda mudam muito.

Recomendacao:

1. Usar queries agregadoras para compor o Inbox.
2. Criar `jur_pendencias` como fonte persistente de travas.
3. Criar `jur_eventos_operacionais` como trilha de auditoria.
4. Criar tabelas do agente desde o inicio, pois execucao/log/validacao precisam de historico.
5. Evoluir para view/materialized view de Inbox quando o volume crescer.

## 14. Contrato de API/queries

### `getInboxOperacional(scope, filtros)`

Retorna:

- `metrics`
- `filas`
- `selected`
- `items`
- `proximasAcoes`

Filtros:

- `fila`
- `responsavel_id`
- `tipo`
- `prioridade`
- `status`
- `data_de`
- `data_ate`
- `cliente_id`
- `processo_id`
- `equipe_id`

### `getProximasAcoes(scope)`

Retorna sugestoes globais:

- titulo
- descricao
- prioridade
- quantidade
- acao_label
- acao_url

### `listAgenteExecucoes(scope)`

Retorna execucoes recentes com:

- receita
- fonte
- status
- datas
- erro
- arquivos
- validacoes

### `criarExecucaoAgente(receita_id, payload)`

Cria execucao pendente para worker externo.

### `validarResultadoAgente(execucao_id, status, observacao)`

Registra validacao humana e dispara evento.

## 15. Worker do agente

O worker deve ser externo ao runtime web.

Responsabilidades:

- Buscar execucoes pendentes.
- Marcar `em_execucao`.
- Executar receita por `script_key`.
- Registrar logs por etapa.
- Salvar arquivos e metadados.
- Atualizar status final.
- Criar pendencia quando precisar de humano.

Tecnologias possiveis:

- Playwright para portais web.
- APIs oficiais quando existirem.
- Leitura de e-mail monitorado.
- OCR/PDF parser para documentos.
- Scheduler por cron/job.

## 16. Adaptacao especifica para GKIT Jur

### Primeiros modulos a conectar

1. Processos.
2. Publicacoes.
3. Prazos.
4. Documentos.
5. Tarefas internas.
6. Automacoes/agente.

### Primeiras receitas do agente

| Receita | Fonte | Resultado |
| --- | --- | --- |
| Coletar publicacoes do dia | Diario/portal/API | Publicacoes em triagem |
| Consultar andamento processual | Portal tribunal | Movimentacoes e alertas |
| Baixar documento recente | Portal tribunal | Arquivo para validacao |
| Verificar prazos sem responsavel | Base interna | Pendencias |
| Revisar processos sem movimentacao | Base interna | Itens sem retorno |
| Coletar e-mails juridicos | Caixa monitorada | Tarefas/publicacoes/documentos |

### Filas iniciais recomendadas

- Hoje.
- Criticos.
- Prazos.
- Publicacoes.
- Pendencias.
- Automacao.
- Sem retorno.

## 17. MVP recomendado

### Sprint 1 - Fundacao

- Criar schema de pendencias, eventos e agente.
- Criar query `getInboxOperacional`.
- Criar tela de Inbox com filas e KPIs.
- Criar tela do agente com fontes, receitas e execucoes.
- Criar validacao manual de execucao.

### Sprint 2 - Fontes juridicas

- Conectar publicacoes.
- Conectar prazos.
- Criar regras de score juridico.
- Criar pendencias automaticas para publicacao nao vinculada e prazo sem responsavel.

### Sprint 3 - Worker

- Implementar worker de execucoes pendentes.
- Registrar logs e arquivos.
- Adicionar retry e timeout.
- Criar bloqueios por captcha/2FA.

### Sprint 4 - Operacao assistida

- Usar Inbox como tela inicial.
- Medir itens resolvidos, tempo de resposta e gargalos.
- Ajustar pesos de prioridade.
- Criar relatorio gerencial.

## 18. Criterios de aceite

- Usuario inicia a rotina pelo Inbox e encontra itens acionaveis sem busca manual.
- Cada item abre diretamente o modulo correto.
- Itens respeitam escopo de permissao.
- Pendencias resolvidas deixam de aparecer nas filas ativas.
- Prazos criticos aparecem antes de tarefas de menor risco.
- Execucao do agente tem status, logs e historico.
- Arquivo coletado pelo agente exige validacao quando sensivel.
- Falha do agente gera pendencia humana.
- Toda acao sensivel registra evento/auditoria.
- Automacao bloqueada impede nova acao automatica sem bloquear acao manual autorizada.

## 19. Fora do MVP

- Peticionamento automatico sem aprovacao humana.
- Login automatico em fonte com 2FA sem fluxo de autorizacao.
- Decisao juridica feita pelo agente.
- Alteracao massiva de prazos sem revisao.
- Envio automatico a cliente sem template aprovado.

## 20. Perguntas abertas para o GKIT Jur

- Qual e a entidade principal de escopo: carteira, cliente, equipe, escritorio ou area?
- O sistema ja tem uma tabela consolidada de processos?
- Publicacoes entram por API, e-mail, importacao ou scraping?
- Prazos ja existem como fonte de verdade?
- O agente deve rodar em infraestrutura propria ou worker separado?
- Quais atos exigem aprovacao de advogado?
- Quais fontes externas tem captcha/2FA?
- O Inbox deve ser por usuario, por equipe ou misto?
