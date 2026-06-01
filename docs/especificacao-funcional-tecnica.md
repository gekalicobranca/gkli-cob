# GKLI Cobranca - Especificacao funcional e tecnica

## 1. Objetivo

O GKLI Cobranca e uma plataforma operacional para cobranca condominial extrajudicial, com apoio a acordos, reguas de comunicacao, importacao/conversao de dados, mensageria, auditoria e acompanhamento por carteira.

Esta especificacao consolida a visao funcional e tecnica observada no modelo de dados, nos modulos da aplicacao e nas entregas documentadas. O documento deve ser tratado como vivo: cada fluxo implementado, ajustado ou descoberto deve atualizar aqui a regra de negocio, a fonte de dados e as pendencias conhecidas.

## 2. Pilares do produto

### 2.1 Dados e importacao

Responsavel por transformar arquivos externos em base operacional confiavel.

Escopo funcional:

- importar condominios, unidades, cobrancas, parcelas e dados de administradoras;
- converter relatorios de formatos diferentes para o padrao GKLI;
- preservar origem da linha e rastreabilidade da importacao;
- validar dados antes de promover para a base operacional;
- manter historico de importacoes e conversoes.

Principais entidades tecnicas:

- `importacoes`
- `conversoes_relatorio`
- `cobrancas`
- `cobranca_parcelas`
- `condominios`
- `unidades`
- `administradoras`
- `administradora_contatos`

Modulos relacionados:

- `features/importacoes`
- `features/conversao-relatorio`
- `features/base-cadastral`
- `features/condominios`
- `features/unidades`
- `features/administradoras`

### 2.2 Operacao de cobranca e acordos

Responsavel pelo trabalho diario do operador: priorizar, contatar, negociar, formalizar acordo, acompanhar parcelas e resolver pendencias.

Escopo funcional:

- criar e acompanhar cobrancas por carteira, condominio e unidade;
- registrar status operacional e financeiro da cobranca;
- centralizar a visao da cobranca em um workspace operacional;
- gerar acordos extrajudiciais ou judiciais;
- registrar entrada, parcelas, pagamentos, quebras, quitacoes e renegociacoes;
- bloquear formalizacao quando houver regra operacional pendente, como planilha de debitos desatualizada;
- registrar timeline de eventos relevantes.

Principais entidades tecnicas:

- `cobrancas`
- `cobranca_parcelas`
- `acordos`
- `acordos_parcelas`
- `parcelas_acordo`
- `acordos_timeline`
- `central_pendencias`
- `timeline_operacional`

Modulos relacionados:

- `features/cobrancas`
- `features/acordos`
- `features/cockpit`
- `features/pendencias`
- `features/timeline`
- `features/operacional`

Observacao tecnica:

Existem duas tabelas para parcelas de acordo, `acordos_parcelas` e `parcelas_acordo`. A fonte de verdade precisa ser confirmada antes de novas alteracoes de fluxo financeiro.

### 2.3 Automacao, mensageria e auditoria

Responsavel por gerar comunicacoes, executar reguas, manter compliance operacional, registrar retornos e preservar trilha de auditoria.

Escopo funcional:

- criar templates por tipo, canal, carteira, categoria e intensidade;
- gerar mensagens manuais ou por regua;
- agrupar mensagens em lotes;
- respeitar janelas de horario, limites diarios, intervalos minimos e bloqueios de destinatario;
- registrar eventos de mensageria e retornos;
- executar jobs de regua de cobranca e acordo;
- suspender automacao por cobranca, acordo, unidade ou condominio;
- registrar auditoria operacional e eventos do sistema.

Principais entidades tecnicas:

- `reguas`
- `regua_etapas`
- `regua_jobs`
- `regua_pausas`
- `regua_compliance_regras`
- `regua_destinatarios_bloqueados`
- `regua_inteligencia_scores`
- `mensagens`
- `mensagens_templates`
- `mensagens_templates_metricas`
- `mensageria_eventos`
- `mensageria_logs`
- `automacoes`
- `automacoes_execucoes`
- `audit_logs`
- `auditoria_eventos`
- `auditoria_operacional`
- `timeline_operacional`

Modulos relacionados:

- `features/regua`
- `features/reguas`
- `features/mensageria`
- `features/lotes`
- `features/timeline`
- `app/api/regua/scheduler`
- `app/api/regua/processar`

## 3. Perfis de usuario

Perfis observados em `profiles.role`:

- `admin`: administra configuracoes globais, carteiras, usuarios e operacao.
- `gestor`: acompanha produtividade, funil, prioridades, acordos e indicadores.
- `operador`: executa cobrancas, envia mensagens, registra retornos, cria acordos e resolve pendencias.
- `leitura`: consulta dados sem alterar operacao.

Controle de acesso por carteira:

- `usuarios_carteiras` vincula usuarios a carteiras.
- toda listagem operacional sensivel deve filtrar por carteira acessivel ao usuario.
- operacoes administrativas globais devem exigir papel adequado.

## 4. Entidades centrais

### 4.1 Carteira

Agrupador operacional e comercial da plataforma.

Tabela principal: `carteiras`

Responsabilidades:

- segmentar clientes, dados e usuarios;
- permitir templates, reguas, administradoras e regras por carteira;
- servir de chave de filtro para dashboards e operacao.

### 4.2 Condominio

Representa o cliente/empreendimento onde existem unidades inadimplentes.

Tabela principal: `condominios`

Responsabilidades:

- guardar dados cadastrais e parametros de cobranca;
- vincular administradora;
- definir regua de cobranca e regua de acordo;
- armazenar classificacao operacional;
- controlar regras de acordo, como quantidade de parcelas sem aprovacao do sindico e prazo para reemissao de parcela atrasada.

### 4.3 Unidade

Representa a unidade devedora ou acompanhada.

Tabela principal: `unidades`

Responsabilidades:

- vincular responsavel, telefone, e-mail e identificacao;
- agrupar cobrancas e acordos;
- apoiar contato e historico operacional.

### 4.4 Cobranca

Representa um debito ou agrupamento operacional de debitos em cobranca.

Tabela principal: `cobrancas`

Responsabilidades:

- manter valor original, valor atualizado e componentes financeiros;
- controlar status operacional e financeiro;
- registrar origem de importacao/conversao;
- alimentar scores, proxima acao e recomendacoes;
- vincular operador, condominio e unidade.

Estados observados:

- operacional: `novo`, `em_cobranca_ativa`, `em_negociacao`, `acordo_firmado`, `acordo_efetivado`, `judicializado`, `suspenso`;
- financeiro: `em_aberto`, `parcial`, `quitado`, `vencido`, `renegociado`.

### 4.5 Acordo

Representa uma negociacao formalizada ou em acompanhamento.

Tabela principal: `acordos`

Responsabilidades:

- controlar tipo extrajudicial/judicial;
- guardar valor acordado, entrada, documento e numero de processo;
- acompanhar status financeiro e operacional;
- registrar parcelas, pagamentos, quebra, quitacao, cancelamento ou renegociacao;
- manter vinculo com cobranca original quando aplicavel.

Estados observados:

- `ativo`
- `em_dia`
- `em_atraso`
- `vencido`
- `quebrado`
- `quitado`
- `cancelado`
- `renegociado`

### 4.6 Administradora

Ator operacional que fornece planilhas, boletos e retornos necessarios para a cobranca.

Tabelas principais:

- `administradoras`
- `administradora_contatos`
- `solicitacoes_administradora`
- `lotes_administradora`
- `lote_administradora_itens`
- `templates_mensageria_adm`

Responsabilidades:

- vincular condominios a uma administradora;
- registrar contatos e preferencias de recebimento;
- gerar solicitacoes rastreaveis com codigo GKLI-ADM;
- controlar retorno manual hoje e preparar retorno automatico futuro.

### 4.7 Regua

Conjunto de etapas de comunicacao ou acao operacional.

Tabelas principais:

- `reguas`
- `regua_etapas`
- `regua_jobs`
- `regua_pausas`
- `regua_compliance_regras`
- `regua_destinatarios_bloqueados`

Responsabilidades:

- definir etapas por tipo de fluxo;
- agendar execucao;
- respeitar compliance;
- pausar automacao quando houver impedimento operacional;
- alimentar mensagens e timeline.

### 4.8 Mensagem

Registro de comunicacao gerada, aprovada, enviada ou retornada.

Tabelas principais:

- `mensagens`
- `mensagens_templates`
- `mensagens_templates_metricas`
- `mensageria_eventos`
- `mensageria_logs`

Responsabilidades:

- renderizar conteudo a partir de templates;
- registrar canal, destinatario, lote, status e retorno;
- permitir auditoria por evento;
- alimentar metricas de template.

## 5. Fluxos funcionais

### 5.1 Importacao de relatorios

Fluxo esperado:

1. Usuario envia arquivo.
2. Sistema identifica ou recebe o layout de origem.
3. Conversor extrai linhas e normaliza campos.
4. Sistema mostra previa para validacao.
5. Usuario confirma importacao.
6. Sistema cria/atualiza condominios, unidades, cobrancas e parcelas.
7. Importacao registra origem, arquivo, status e eventuais erros.

Criterios de aceite:

- arquivo invalido nao deve alterar base operacional;
- linhas rejeitadas devem ser explicadas;
- toda cobranca criada por importacao deve preservar `importacao_id` ou `conversao_relatorio_id` quando disponivel;
- importacao repetida deve evitar duplicidade operacional.

### 5.2 Cobranca ativa

Fluxo esperado:

1. Cobranca entra como `novo`.
2. Operador ou regua inicia contato.
3. Status passa para `em_cobranca_ativa` ou `em_negociacao`.
4. Mensagens, retornos e notas sao registrados na timeline.
5. Sistema calcula prioridade, risco e proxima acao.
6. Resultado pode ser acordo, judicializacao, suspensao, quitacao ou renegociacao.

Criterios de aceite:

- mudanca de status deve registrar evento operacional;
- mensagens enviadas devem ficar vinculadas a cobranca;
- automacao bloqueada deve impedir novas acoes automaticas sem impedir acoes manuais autorizadas;
- dashboards devem refletir status operacional e financeiro separadamente.

### 5.3 Formalizacao de acordo

Fluxo esperado:

1. Operador seleciona cobranca/unidade.
2. Sistema valida regras do condominio e pendencias da administradora.
3. Se a planilha de debitos estiver desatualizada, sistema bloqueia formalizacao e gera solicitacao ADM.
4. Com dados atualizados, operador define valor, entrada e parcelas.
5. Sistema cria acordo e parcelas.
6. Sistema atualiza status da cobranca para acordo firmado/efetivado conforme regra.
7. Sistema registra timeline e auditoria.

Criterios de aceite:

- acordo nao deve ser formalizado quando houver bloqueio critico de planilha;
- parcelas precisam somar valor coerente com acordo e entrada;
- status financeiro do acordo deve refletir pagamentos e vencimentos;
- renegociacao deve manter vinculo com acordo de origem.

### 5.4 Acompanhamento de parcelas de acordo

Fluxo esperado:

1. Scheduler ou operador verifica parcelas vencidas e pagas.
2. Sistema atualiza status da parcela.
3. Sistema recalcula status do acordo.
4. Em atraso relevante, sistema aciona regua de acordo ou pendencia operacional.
5. Quitacao de todas as parcelas encerra o acordo como `quitado`.
6. Inadimplencia persistente pode marcar acordo como `quebrado`.

Criterios de aceite:

- pagamento de entrada deve atualizar campos de entrada;
- atraso deve distinguir `em_atraso`, `vencido` e `quebrado` conforme regra;
- toda mudanca automatica precisa registrar origem e horario.

### 5.5 Regua de cobranca

Fluxo esperado:

1. Scheduler identifica cobrancas elegiveis.
2. Sistema verifica pausas, blacklist, janela de horario, limite diario e intervalo minimo.
3. Sistema escolhe etapa aplicavel da regua.
4. Sistema gera mensagem ou pendencia.
5. Evento entra em mensageria, logs e timeline.

Criterios de aceite:

- destinatario bloqueado nao recebe mensagem automatica;
- finais de semana respeitam regra de compliance;
- dry run do scheduler deve mostrar impacto sem alterar registros;
- falhas devem ficar rastreaveis em job/log.

### 5.6 Regua de acordo

Fluxo esperado:

1. Sistema identifica acordos ativos com parcelas proximas do vencimento, vencidas ou em risco.
2. Compliance valida se pode comunicar.
3. Sistema gera lembrete, pendencia ou pausa conforme retorno/status.
4. Status do acordo e parcelas e sincronizado.

Criterios de aceite:

- lembrete de parcela nao deve ser enviado se parcela ja foi paga;
- acordo quitado/cancelado/quebrado nao deve seguir regua normal;
- comunicacoes devem apontar para acordo e parcela quando possivel.

### 5.7 Solicitacoes para administradora

Fluxo esperado:

1. Operador ou regra cria solicitacao.
2. Sistema gera codigo de rastreio.
3. Mensagem ou assunto inclui codigo.
4. Operador envia manualmente ou sistema envia quando integracao existir.
5. Retorno e registrado manualmente no momento atual.
6. Sistema atualiza status, competencia de planilha, timeline e libera fluxo bloqueado.

Criterios de aceite:

- codigo de rastreio deve ser unico;
- solicitacao deve referenciar administradora e, quando aplicavel, condominio, unidade, cobranca ou acordo;
- retorno manual deve preservar observacao e origem;
- estrutura deve permitir troca futura para Microsoft Graph sem mudar modelo principal.

### 5.8 Portal do sindico

Fluxo esperado:

1. Usuario do portal recebe convite.
2. Convite cria sessao/autenticacao propria.
3. Sindico acessa condominios vinculados.
4. Sindico aprova, consulta ou acompanha informacoes permitidas.
5. Acoes sao auditadas.

Principais entidades:

- `portal_sindico_usuarios`
- `portal_sindico_convites`
- `portal_sindico_sessoes`
- `portal_sindico_condominios`
- `portal_sindico_auditoria`

Criterios de aceite:

- usuario do portal nao deve acessar condominio nao vinculado;
- convite expirado ou usado nao deve criar acesso;
- toda acao sensivel deve registrar auditoria.

## 6. Regras de status

### 6.1 Cobranca

Status operacional indica etapa de trabalho. Status financeiro indica situacao de pagamento.

Transicoes esperadas:

- `novo` -> `em_cobranca_ativa`
- `em_cobranca_ativa` -> `em_negociacao`
- `em_negociacao` -> `acordo_firmado`
- `acordo_firmado` -> `acordo_efetivado`
- qualquer status elegivel -> `judicializado`
- qualquer status elegivel -> `suspenso`

Regras pendentes de confirmacao:

- diferenca exata entre `acordo_firmado` e `acordo_efetivado`;
- quando uma cobranca deve ser marcada como `quitado`;
- se uma cobranca agrupada deve encerrar todas as parcelas vinculadas ao acordo.

### 6.2 Acordo

Status do acordo deve ser derivado de parcelas, entrada e decisao operacional.

Transicoes esperadas:

- `ativo` -> `em_dia`
- `em_dia` -> `em_atraso`
- `em_atraso` -> `vencido`
- `vencido` -> `quebrado`
- `ativo`/`em_dia` -> `quitado`
- qualquer status elegivel -> `cancelado`
- qualquer status elegivel -> `renegociado`

Regras pendentes de confirmacao:

- prazo para considerar acordo quebrado;
- se pagamento parcial mantem `em_atraso` ou cria outro estado operacional;
- qual tabela de parcelas deve ser fonte de verdade.

## 7. Requisitos tecnicos

### 7.1 Arquitetura observada

- Next.js com App Router.
- React 19.
- Supabase como banco/autenticacao.
- TypeScript.
- Modulos organizados por `features`.
- APIs internas em `app/api`.
- SQL incremental em `supabase/sql` e `database`.

### 7.2 Padroes esperados

- Server actions e queries devem manter regra de carteira/permissao.
- Alteracoes de status devem registrar timeline/auditoria quando relevantes.
- Operacoes automaticas devem gravar job/log/resumo.
- Importacoes devem ser idempotentes sempre que possivel.
- Templates devem ser resolvidos por funcao unica de renderizacao.
- Dados financeiros devem evitar calculos duplicados em UI e backend.

### 7.3 Auditoria

Eventos sensiveis devem gravar:

- entidade afetada;
- usuario/origem;
- status anterior e novo quando aplicavel;
- payload bruto quando a origem for automatica ou externa;
- horario do evento.

Tabelas candidatas:

- `timeline_operacional` para narrativa operacional;
- `auditoria_eventos` para alteracoes estruturadas;
- `audit_logs` e `auditoria_operacional` para compatibilidade/historico;
- `mensageria_logs` e `mensageria_eventos` para comunicacoes.

Ponto de atencao:

Ha varias tabelas de auditoria. E necessario definir qual e a fonte primaria por tipo de evento para evitar duplicidade sem leitura clara.

### 7.4 Integracoes futuras

Preparacoes ja aparentes:

- Microsoft Graph para retorno de administradoras por e-mail.
- WhatsApp/e-mail via webhooks para retorno automatico de mensagens.
- Agente automatico para coleta em portais de administradoras.
- IA operacional para recomendacao, classificacao e interacao assistida.

Entidades relacionadas:

- `agente_administradoras`
- `agente_credenciais`
- `agente_receitas`
- `agente_execucoes`
- `agente_arquivos`
- `agente_logs`
- `agente_validacoes`
- `ai_interacoes`
- `regua_inteligencia_scores`

## 8. Modulos da aplicacao

Mapa inicial entre dominio e codigo:

| Dominio | Pasta principal | Rotas/API relacionadas |
| --- | --- | --- |
| Cobrancas | `features/cobrancas` | `app/app/cobrancas`, `app/app/workspace/[id]` |
| Acordos | `features/acordos` | `app/aceite-acordo/[token]`, `app/api/jobs/acordos/check-status` |
| Importacoes | `features/importacoes` | `app/api/conversao-relatorio/*` |
| Conversao de relatorios | `features/conversao-relatorio` | `app/app/conversao-relatorio` |
| Reguas | `features/regua`, `features/reguas` | `app/api/regua/scheduler`, `app/api/regua/processar` |
| Mensageria | `features/mensageria` | modulos internos de renderizacao/envio |
| Administradoras | `features/administradoras` | `app/app/administradoras` |
| Timeline | `features/timeline` | usado por cobrancas/acordos/operacional |
| Pendencias | `features/pendencias` | `app/app/agenda` |
| IA | `features/ia`, `features/ai` | `app/api/ia/chat` |
| Agente automatico | `features/agente-automatico` | `app/app/agente-automatico` |
| Analytics/Dashboard | `features/analytics`, `features/dashboard` | `app/app/analitica`, dashboard interno |

## 9. Riscos e lacunas

### 9.1 Modelo duplicado ou legado

- `acordos_parcelas` e `parcelas_acordo` parecem cobrir conceitos muito proximos.
- `audit_logs`, `auditoria_eventos`, `auditoria_operacional` e `timeline_operacional` podem se sobrepor.
- `status`, `estado`, `status_operacional` e `status_financeiro` coexistem em `cobrancas`.

Acao recomendada:

Definir fonte de verdade por dominio antes de criar novas regras automaticas.

### 9.2 Encoding e nomenclatura

Alguns textos observados aparecem com caracteres corrompidos em dumps/documentos. Isso pode afetar status antigos, templates e documentacao.

Acao recomendada:

Validar encoding dos arquivos e padronizar valores internos sem acentos quando forem enums/status.

### 9.3 Regras financeiras

Campos de juros, multa, correcao, desconto, valor original e valor atualizado existem, mas a regra unica de calculo precisa estar explicita.

Acao recomendada:

Documentar formula oficial por carteira/condominio e centralizar calculo em modulo compartilhado.

### 9.4 Automacao com efeitos operacionais

Scheduler, regua e mensageria podem alterar status, gerar mensagens e criar pendencias.

Acao recomendada:

Toda execucao automatica deve suportar dry run, log resumido, idempotencia e auditoria.

### 9.5 Permissoes por carteira

O modelo tem `usuarios_carteiras`, mas cada query precisa respeitar isso de forma consistente.

Acao recomendada:

Criar checklist de seguranca por query/action: filtra carteira, valida role, registra auditoria quando altera dado sensivel.

## 10. Prioridade sugerida para evolucao

1. Confirmar fontes de verdade: parcelas de acordo, auditoria, status de cobranca.
2. Mapear fluxo real de cobranca no codigo e alinhar status/transicoes.
3. Mapear fluxo real de acordo e padronizar sincronizacao de parcelas/status.
4. Fechar especificacao de importacao idempotente.
5. Consolidar regras de regua/compliance com criterios de aceite testaveis.
6. Especificar permissoes por carteira e papel.
7. Criar backlog tecnico a partir das lacunas confirmadas.

## 11. Definicao de pronto para novas entregas

Uma entrega funcional deve ser considerada pronta quando:

- regra de negocio esta descrita neste documento ou em doc especifico referenciado;
- tabelas afetadas e fonte de verdade estao identificadas;
- fluxo possui criterio de aceite;
- mudancas de status geram timeline/auditoria quando aplicavel;
- filtros por carteira e permissao foram considerados;
- cenarios de erro e dados duplicados foram tratados;
- existe validacao manual ou automatizada proporcional ao risco.

