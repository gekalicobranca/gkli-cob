# Pré-Jurídico — especificação funcional

Atualizado em 26/08/2026.

## 1. Visão geral

O módulo Pré-Jurídico organiza a passagem de cobranças vencidas do fluxo extrajudicial para a preparação jurídica. Ele cobre desde a identificação da cobrança elegível até a geração de documentos, coleta de procuração assinada, criação de Flow de envio, acompanhamento dos disparos e confirmação de distribuição ao jurídico.

O módulo é orientado por unidade: após iniciado o processamento, todas as cobranças abertas da mesma unidade passam a compor um caso pré-jurídico único.

## 2. Objetivos funcionais

- Identificar cobranças que excederam a janela de cobrança ativa e podem ser encaminhadas ao pré-jurídico.
- Permitir encaminhamento controlado ao pré-jurídico, respeitando escopo de carteira.
- Agrupar cobranças por unidade para preparação documental.
- Gerar laudo pré-jurídico e procuração.
- Manter a procuração no processamento como `gerada` até que seja enviada pelo Flow.
- Montar lote, régua e Flow para envio de procurações ao síndico.
- Monitorar, no próprio Flow, agenda, envios, falhas, motivos de falha e reenvios.
- Confirmar retorno do jurídico e distribuição.
- Marcar cobranças/unidade como judicializadas ao concluir a distribuição.

## 3. Escopo

### Incluído

- Painel de cobranças elegíveis.
- Processamento pré-jurídico por etapas.
- Geração de laudos e procurações em PDF.
- Régua pré-jurídica por carteira.
- Criação de lote pré-jurídico.
- Criação e operação de Flow.
- Agendamento e disparo automático de e-mail pré-jurídico.
- Monitoramento dos envios dentro da tela Flow.
- Reenvio de itens com falha.
- Listagem de lotes pré-jurídicos.
- Registro de eventos operacionais e logs de mensageria.

### Fora do escopo atual

- Gestão do contencioso completo após distribuição.
- Controle de prazos processuais judiciais.
- Gestão financeira do processo judicial.
- Fluxos de comunicação geral fora do pré-jurídico.
- Régua pré-jurídica por condomínio; no pré-jurídico a régua é por carteira.

## 4. Atores e permissões

### Atores

- Operador: executa encaminhamento, gera documentos, cria Flow e acompanha envios.
- Gestor: executa as mesmas ações do operador e revisa operação por carteira.
- Administrador: possui acesso amplo e pode configurar réguas e carteiras.

### Regra de autorização

As ações de movimentação e criação exigem perfil `admin`, `gestor` ou `operador`.

As consultas e alterações respeitam o escopo de carteiras permitido ao usuário. Um usuário só pode ver e movimentar casos, cobranças, lotes, mensagens e flows das carteiras às quais tem acesso.

## 5. Navegação do módulo

Menu lateral: Pré-Jurídico.

Itens visíveis:

- Painel Pré: `/app/pre-juridico`
- Flow: `/app/pre-juridico/flow`
- Processamento: `/app/pre-juridico/processamento`
- Lotes: `/app/pre-juridico/lotes`
- Régua: `/app/pre-juridico/regua`

Não existe chamada operacional separada para “Monitor de lote” ou “Monitor de Flow”. O monitoramento de envios fica concentrado na área `Flows` da tela Flow.

## 6. Conceitos funcionais

### Cobrança elegível

Cobrança que atingiu a regra de encaminhamento ao pré-jurídico, ainda está em status operacional ativo e não está vinculada a acordo.

### Caso pré-jurídico

Registro operacional que acompanha uma unidade no pré-jurídico. Um caso pode nascer de cobrança ou de legado de acordo, mas a operação atual consolida por unidade.

### Laudo

Documento em PDF que consolida o histórico e as cobranças da unidade para preparação jurídica.

### Procuração

Documento em PDF enviado ao síndico para assinatura. Quando gerada, a procuração fica disponível para o Flow.

### Régua

Configuração da agenda, templates e etapas de envio. No pré-jurídico, a régua é por carteira.

### Lote

Conjunto de itens e mensagens gerado a partir das procurações selecionadas. O lote contém o conteúdo operacional produzido.

### Flow

Junção entre lote e régua para execução monitorada dos envios. O Flow controla envio, pausa, cancelamento, agenda, falhas, reenvio e contadores operacionais.

Em linguagem de operação:

1. cria lote;
2. vincula régua;
3. cria Flow;
4. monitora envios no Flow.

## 7. Habilitação e elegibilidade

Uma cobrança só entra como elegível quando todas as condições abaixo forem verdadeiras:

- A carteira está habilitada para gerar pré-jurídico.
- O condomínio está habilitado para pré-jurídico.
- A cobrança possui vencimento válido.
- O atraso é maior ou igual à regra `D+ prazo_total`.
- O status operacional está entre:
  - `novo`;
  - `em_cobranca_ativa`;
  - `em_negociacao`;
  - `possivel_acordo`.
- A cobrança não está vinculada a acordo.
- O status financeiro não é `quitado` nem `cancelado`.

O prazo total considerado no painel é:

`prazo_total = inicio_cobranca_dias + dias_cobranca_ativa`

Cobranças já encaminhadas aparecem como `encaminhado` quando o status operacional é `pre_juridico`.

## 8. Fluxo funcional ponta a ponta

### 8.1 Identificar e encaminhar cobrança

Tela: Painel Pré.

1. Operador filtra cobranças por carteira, condomínio, vencimento, situação ou busca textual.
2. Sistema exibe cobranças elegíveis e encaminhadas, agrupadas por condomínio.
3. Operador seleciona cobranças elegíveis.
4. Operador clica em `Encaminhar cobrança(s)`.
5. Sistema altera a cobrança para status operacional `pre_juridico`.
6. A unidade passa a aparecer na tela Processamento como aguardando início.

### 8.2 Iniciar processamento e gerar laudo

Tela: Processamento.

1. A seção `Aguardando início` exibe unidades encaminhadas que ainda não possuem caso operacional.
2. Operador seleciona unidades.
3. Operador clica em `Gerar laudo`.
4. Sistema cria ou reaproveita o caso pré-jurídico da unidade.
5. Sistema agrupa todas as cobranças abertas da unidade.
6. Sistema abre a tela de laudos gerados.
7. Caso entra na etapa `Confirmar propriedade`.

### 8.3 Confirmar propriedade

Etapa: `aguardando_documentos`.

Nome exibido: Confirmar propriedade.

1. Operador solicita ou registra andamento da certidão.
2. Status possíveis da certidão:
  - `pendente`;
  - `solicitada`;
  - `recebida`.
3. Ao marcar a certidão como `recebida`, o caso avança automaticamente para Procuração.

### 8.4 Gerar procuração

Etapa: `aguardando_sindico`.

Nome exibido: Procuração.

1. Operador seleciona uma ou mais unidades/casos.
2. Operador clica em `Gerar procuração`.
3. A geração abre em nova aba.
4. Sistema marca a procuração como `gerada`.
5. O caso permanece na etapa Procuração no processamento.
6. A procuração gerada entra automaticamente na disponibilidade do Flow.

Status possíveis da procuração:

- `pendente`;
- `gerada`;
- `enviada`;
- `assinada`.

Ao marcar como `assinada`, o caso avança automaticamente para Confirmar jurídico.

### 8.5 Montar Flow

Tela: Flow.

1. A etapa `Disponibilidade` lista apenas procurações com status `gerada` e ainda sem lote/Flow.
2. Operador seleciona as procurações.
3. Sistema agrupa as seleções por carteira.
4. Em `Lotes + régua`, cada linha representa um lote por carteira.
5. Operador seleciona a régua da carteira na linha do lote.
6. Operador clica em `Criar Flow`.
7. Sistema cria:
  - lote pré-jurídico;
  - itens do lote;
  - mensagens;
  - anexos/documentos quando aplicável;
  - Flow vinculado ao lote e à régua;
  - vínculo do caso ao lote e ao Flow.
8. O Flow aparece na etapa `Flows`.

### 8.6 Enviar e monitorar Flow

Tela: Flow, seção `Flows`.

1. Operador abre o Flow.
2. Operador clica em `Enviar`.
3. Sistema agenda as mensagens conforme a régua.
4. Flow passa para `Em execução`.
5. O monitor automático executa mensagens agendadas.
6. A linha do Flow mostra contadores de:
  - pendentes;
  - agendadas;
  - enviadas;
  - falhas;
  - próximo disparo.
7. Ao abrir o Flow, a fila de envio mostra:
  - status;
  - caso;
  - destino;
  - agenda;
  - ação.

Quando uma mensagem é enviada com sucesso:

- a mensagem vira `enviada`;
- o item do lote vira `enviado`;
- a procuração do caso vira `enviada`;
- o Flow é recalculado.

Quando uma mensagem falha:

- a mensagem vira `falha`;
- o motivo da falha fica visível na linha;
- o item fica disponível para `Reenviar`;
- o Flow contabiliza a falha.

### 8.7 Reenviar falha

1. Operador identifica item com status `Falha`.
2. Sistema mostra `Motivo da falha`.
3. Operador clica em `Reenviar`.
4. Sistema limpa erro anterior.
5. Sistema volta a mensagem para `Agendada`.
6. Sistema reabre o Flow como `Em execução`.
7. Monitor automático tentará o envio no próximo ciclo.

O reenvio não dispara comunicação por fora do Flow.

### 8.8 Confirmar retorno do jurídico

Etapa: `confirmar_juridico`.

1. Operador registra a confirmação do jurídico.
2. Status disponíveis:
  - `pendente`;
  - `pronto`.
3. Ao marcar como `pronto`, o caso avança automaticamente para Distribuição.
4. Sistema define distribuição como `solicitado`.

### 8.9 Distribuição

Etapa: `pronto_juridico`.

Nome exibido: Distribuição.

1. Operador acompanha o status de distribuição.
2. Status possíveis:
  - `solicitado`;
  - `distribuido`.
3. Ao marcar como `distribuido`:
  - a unidade recebe marcação de ação judicial;
  - todas as cobranças abertas da unidade são marcadas como `judicializado`;
  - cobranças quitadas, pagas ou canceladas não são alteradas.

## 9. Telas e requisitos funcionais

### 9.1 Painel Pré

Rota: `/app/pre-juridico`

Finalidade: identificar e encaminhar cobranças elegíveis.

Indicadores:

- Valor elegível.
- Elegíveis.
- Encaminhadas.
- Unidades no recorte.

Filtros:

- Busca por unidade ou responsável.
- Carteira.
- Condomínio.
- Vencimento de/até.
- Situação.

Requisitos:

- Listar somente cobranças elegíveis ou já encaminhadas.
- Agrupar por condomínio.
- Permitir seleção individual, por condomínio e geral das elegíveis.
- Desabilitar seleção de cobranças já encaminhadas.
- Encaminhar selecionadas ao pré-jurídico mediante confirmação.

### 9.2 Processamento

Rota: `/app/pre-juridico/processamento`

Finalidade: acompanhar a preparação jurídica da unidade.

Indicadores:

- Aguardando início.
- Confirmar propriedade.
- Em validação.
- Em distribuição.

Etapas operacionais exibidas:

- Aguardando início.
- Confirmar propriedade.
- Procuração.
- Confirmar jurídico.
- Distribuição.

Requisitos:

- Localizar por carteira, condomínio, etapa, unidade ou responsável.
- Iniciar processamento gerando laudo.
- Agrupar cobranças abertas por unidade.
- Gerar procuração em massa.
- Atualizar status de procuração em massa.
- Avançar automaticamente conforme regras de etapa.

### 9.3 Flow

Rota: `/app/pre-juridico/flow`

Finalidade: criar e monitorar os envios do pré-jurídico.

Seções:

- Disponibilidade.
- Lotes + régua.
- Flows.

Requisitos da Disponibilidade:

- Mostrar apenas casos com procuração `gerada`.
- Excluir casos já vinculados a lote ou Flow.
- Permitir seleção múltipla.

Requisitos de Lotes + régua:

- Agrupar por carteira.
- Permitir selecionar a régua na linha do lote.
- Criar Flow somente se houver régua selecionada.

Requisitos de Flows:

- Mostrar status e contadores do Flow.
- Permitir `Enviar`, `Pausar`, `Retomar` e `Cancelar` conforme status.
- Ao abrir um Flow, exibir a fila de envio.
- Exibir motivo da falha por item.
- Permitir reenvio apenas em itens com falha.

### 9.4 Régua

Rota: `/app/pre-juridico/regua`

Finalidade: configurar a agenda e o template de envio por carteira.

Requisitos:

- Criar régua para carteira.
- Listar carteiras configuradas e pendentes.
- Abrir régua no editor geral de réguas.
- Usar tipo `juridico`.
- Aplicar régua a todos os condomínios da carteira.

Cada etapa da régua define:

- ordem;
- nome;
- delay em dias;
- canal;
- categoria/template;
- status ativo/inativo.

Categorias padrão:

- `pre_juridico_carteira`;
- `pre_juridico_administradora`;
- `pre_juridico_sindico`.

Para o fluxo atual de procuração gerada a partir de cobrança, a criação do lote usa a etapa do síndico.

### 9.5 Lotes

Rota: `/app/pre-juridico/lotes`

Finalidade: consultar lotes pré-jurídicos gerados.

Indicadores:

- Lotes encontrados.
- Mensagens preparadas.
- Pendentes de aprovação.
- Erros para revisar.

Filtros:

- Busca por ID, régua ou observação.
- Status do lote.
- Resultado: com mensagens, duplicadas ou erros.

Requisitos:

- Mostrar somente lotes do tipo `pre_juridico`.
- Permitir abrir o detalhe do lote quando necessário.
- O monitoramento operacional de disparos não fica nesta tela; fica no Flow.

## 10. Status e transições

### 10.1 Caso pré-jurídico

Etapas possíveis:

- `aguardando_documentos`: Confirmar propriedade.
- `aguardando_sindico`: Procuração.
- `confirmar_juridico`: Confirmar jurídico.
- `pronto_juridico`: Distribuição.
- `enviado_juridico`: Enviado ao jurídico.
- `analise_juridica`: Análise jurídica.
- `pendencia_juridica`: Pendência jurídica.
- `autorizado_ajuizamento`: Autorizado.
- `judicializado`: Judicializado.

O fluxo operacional atual usa como tela principal as etapas de preparação:

1. Confirmar propriedade.
2. Procuração.
3. Confirmar jurídico.
4. Distribuição.

### 10.2 Certidão

- `pendente`
- `solicitada`
- `recebida`

Transição automática:

- `recebida` move o caso para Procuração.

### 10.3 Procuração

- `pendente`
- `gerada`
- `enviada`
- `assinada`

Transições automáticas:

- `gerada` disponibiliza o caso para Flow.
- Envio bem-sucedido pelo Flow marca como `enviada`.
- `assinada` move o caso para Confirmar jurídico.

### 10.4 Distribuição

- `solicitado`
- `distribuido`

Transição automática:

- `distribuido` marca unidade com ação judicial e judicializa cobranças abertas.

### 10.5 Flow

- `pronto`: Flow criado e aguardando liberação.
- `em_execucao`: Flow liberado, com mensagens agendadas ou em processamento.
- `pausado`: Flow interrompido temporariamente.
- `cancelado`: Flow encerrado sem novos disparos.
- `concluido`: Todas as mensagens encerradas sem falha.
- `concluido_com_falhas`: Todas as mensagens encerradas, mas há falhas.

### 10.6 Mensagem

- `pendente_aprovacao`
- `aprovada`
- `agendada`
- `enviada`
- `falha`
- `cancelada`

No Flow pré-jurídico, o envio transforma mensagens pendentes/aprovadas/falhas em agendadas. O dispatcher envia apenas mensagens `agendada` de Flow em execução.

### 10.7 Lote

Principais status usados:

- `processando`
- `pendente_aprovacao`
- `aprovado`
- `enviado`
- `parcial`
- `concluido`
- `concluido_com_falhas`
- `cancelado`
- `erro`

## 11. Regras de negócio

### 11.1 Elegibilidade

- Carteira e condomínio precisam estar habilitados para pré-jurídico.
- Cobrança vinculada a acordo não entra como elegível.
- Cobrança quitada, paga ou cancelada não deve ser encaminhada.
- O encaminhamento altera a cobrança para `pre_juridico`.

### 11.2 Caso por unidade

- Após laudo, o caso é único por unidade.
- Todas as cobranças abertas da unidade integram o caso.
- A distribuição atua sobre todas as cobranças abertas da unidade.

### 11.3 Procuração e disponibilidade do Flow

- Só entra na disponibilidade do Flow se `procuracao_status = gerada`.
- Não entra se já possuir `procuracao_lote_id`.
- Não entra se já possuir `procuracao_flow_id`.
- Não entra se não houver cobrança vinculada.

### 11.4 Lote

- Lote pré-jurídico só é criado para itens válidos e dentro do escopo da carteira.
- O lote é agrupado por carteira e régua.
- Cada lote pode gerar mensagens, itens pulados, duplicados ou erros.
- Mensagens sem destinatário são puladas.
- Mensagens repetidas para mesma finalidade, destinatário e dia são duplicadas.

### 11.5 Régua

- A régua pré-jurídica é por carteira.
- Condomínio não possui régua própria no pré-jurídico.
- A régua define frequência/agenda e template.
- O lote contém conteúdo; a régua contém agenda/template; o Flow une lote e régua.

### 11.6 Envio

- O botão `Enviar` libera o Flow para agenda; não envia por fora do mecanismo monitorado.
- Mensagens são enviadas pelo dispatcher automático.
- O dispatcher só processa mensagens agendadas com `pre_juridico_flow_id` e Flow em execução.
- Sucesso marca a mensagem como `enviada` e a procuração como `enviada`.
- Falha grava erro em `erro`/`erro_envio` e aparece no Flow.

### 11.7 Reenvio

- Reenvio só é permitido para mensagem com status `falha`.
- Reenvio limpa o erro e reagenda a mensagem.
- Reenvio reabre o Flow em execução.
- Reenvio é rastreado em log de mensageria.

## 12. Documentos gerados

### Laudo pré-jurídico

Pode ser acessado por unidade e gerado na inicialização do processamento.

Conteúdo esperado:

- dados do condomínio;
- dados da unidade;
- responsável;
- cobranças agrupadas;
- valores;
- vencimentos;
- histórico operacional.

### Procuração pré-jurídica

Gerada na etapa Procuração.

Características:

- pode ser gerada em massa;
- abre em nova aba;
- marca o caso como procuração `gerada`;
- fica disponível para o Flow.

### Anexos de mensagem

Na criação de lote/Flow, documentos necessários são gerados e anexados às mensagens quando aplicável.

Os metadados ficam em:

- `documentos_gerados`;
- `mensagem_anexos`.

## 13. Logs, auditoria e rastreabilidade

O módulo registra eventos operacionais para ações relevantes:

- cobrança encaminhada ao pré-jurídico;
- laudo gerado;
- procuração gerada;
- Flow criado;
- lote criado;
- e-mail enviado;
- e-mail com falha;
- item reenviado.

Também registra logs de mensageria para mensagens criadas, enviadas, falhadas e reenviadas.

## 14. Exceções e mensagens operacionais

### Sem contato do síndico

O item do lote é marcado como pulado com motivo indicando ausência de e-mail do síndico.

### Mensagem duplicada

O item é marcado como duplicado quando já existe mensagem para a mesma finalidade, destinatário e dia.

### Falha de envio

O Flow exibe a falha na fila de envio, com motivo. O operador pode reenviar.

### Flow cancelado

Não permite reenvio de item.

### Procuração não gerada

Não entra na disponibilidade do Flow.

### Procuração já vinculada

Não entra novamente na disponibilidade para evitar duplicidade de lote/Flow.

## 15. Critérios de aceite

### Painel Pré

- Deve listar apenas cobranças elegíveis ou encaminhadas.
- Deve calcular atraso e regra D+ corretamente.
- Deve permitir encaminhar apenas elegíveis.

### Processamento

- Deve criar caso por unidade ao gerar laudo.
- Deve agrupar cobranças abertas da unidade.
- Deve permitir geração múltipla de procuração.
- Deve manter procuração gerada no processamento.
- Deve disponibilizar procurações geradas no Flow.

### Flow

- Deve listar somente procurações geradas sem lote/Flow.
- Deve agrupar selecionadas por carteira.
- Deve exigir seleção de régua.
- Deve criar lote e Flow vinculados.
- Deve mostrar contadores e próximo disparo.
- Deve mostrar a fila de envio ao abrir o Flow.
- Deve exibir motivo de falha.
- Deve permitir reenvio apenas em falhas.

### Régua

- Deve operar por carteira.
- Deve permitir configurar etapas, delays e templates.
- Não deve oferecer configuração por condomínio no pré-jurídico.

### Envio

- Deve ocorrer via dispatcher, respeitando agenda da régua.
- Deve marcar procuração como `enviada` após sucesso.
- Deve registrar falhas e permitir reenvio.

### Distribuição

- Deve marcar unidade com ação judicial ao distribuir.
- Deve judicializar cobranças abertas da unidade.
- Não deve alterar cobranças quitadas, pagas ou canceladas.

## 16. Glossário operacional

- Caso: acompanhamento pré-jurídico de uma unidade.
- Lote: agrupamento de conteúdo e mensagens geradas.
- Régua: agenda, frequência, templates e etapas.
- Flow: execução monitorada de lote + régua.
- Dispatcher: processo automático que envia mensagens agendadas.
- Disponibilidade: procurações geradas aptas a montar Flow.
- Fila de envio: itens de um Flow com status, destino, agenda e ação.

