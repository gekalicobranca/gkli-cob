# Modelo operacional — Painel, Processamento, Lote, Régua e Flow

Atualizado em 27/08/2026.

## 1. Objetivo

Esta especificação define o modelo operacional criado no Pré-Jurídico para ser replicado nos fluxos de cobrança e de acordos.

O modelo separa claramente:

- entrada e elegibilidade;
- preparação operacional;
- geração de conteúdo;
- agenda/template;
- execução monitorada;
- acompanhamento de falhas e reenvios.

Em termos de operação:

1. o Painel encontra e encaminha oportunidades;
2. o Processamento prepara os casos;
3. o Lote materializa o conteúdo a ser enviado;
4. a Régua define agenda, frequência e template;
5. o Flow une lote + régua e controla execução, pausa, cancelamento, falhas e reenvio.

## 2. Princípio central

O envio não deve acontecer diretamente a partir de uma lista operacional.

A lista operacional prepara o trabalho. O envio acontece sempre por Flow.

Isso evita que cobrança, acordo e pré-jurídico criem disparos soltos, cada um com uma lógica diferente. O padrão correto é:

```text
Painel → Processamento → Lote + Régua → Flow → Monitoramento
```

## 3. Conceitos

### 3.1 Painel

Tela de entrada do domínio.

Responsabilidade:

- identificar itens elegíveis;
- aplicar filtros operacionais;
- mostrar indicadores de contexto;
- permitir seleção individual e em massa;
- encaminhar itens para o Processamento.

O Painel não cria comunicação final e não dispara mensagens.

Exemplos:

- Pré-Jurídico: cobranças aptas a iniciar preparação jurídica.
- Cobrança: unidades/cobranças aptas a entrar em uma campanha de cobrança.
- Acordos: acordos aptos a lembrete, cobrança de parcela, assinatura, aprovação ou retomada.

### 3.2 Processamento

Tela de preparação operacional.

Responsabilidade:

- transformar itens elegíveis em casos acompanháveis;
- organizar etapas internas;
- permitir ações em massa;
- validar pré-condições;
- gerar documentos ou artefatos;
- disponibilizar casos prontos para montagem de Flow.

O Processamento pode mudar status internos, gerar documentos e registrar confirmações, mas não deve disparar a comunicação final.

### 3.3 Disponibilidade

Lista de casos prontos para virar lote/Flow.

Responsabilidade:

- mostrar apenas itens que cumpriram a condição mínima do domínio;
- excluir itens já vinculados a lote ou Flow ativo;
- permitir seleção múltipla;
- organizar a montagem do lote.

Exemplos de regra de disponibilidade:

- Pré-Jurídico: procuração `gerada`, ainda sem lote/Flow.
- Cobrança: cobrança apta a comunicação, ainda sem Flow ativo para a mesma finalidade.
- Acordos: acordo/parcela apto ao tipo de comunicação, ainda sem Flow ativo equivalente.

### 3.4 Lote

Registro do conteúdo gerado.

Responsabilidade:

- consolidar itens selecionados;
- gerar mensagens;
- gerar anexos quando aplicável;
- registrar duplicidades, itens pulados e erros;
- manter rastreabilidade do que foi preparado.

O lote responde à pergunta: “o que será comunicado?”

O lote não define frequência nem agenda. Ele contém conteúdo.

### 3.5 Régua

Configuração de agenda e template.

Responsabilidade:

- definir quando enviar;
- definir canal;
- definir template/categoria;
- definir etapas e atrasos;
- definir fallback/padrão por escopo.

A régua responde à pergunta: “quando e com qual mensagem será comunicado?”

No modelo replicável, a régua deve ser configurável por escopo do domínio. Exemplos:

- carteira;
- tipo de cobrança;
- tipo de acordo;
- regra global/fallback.

No Pré-Jurídico, a decisão foi: régua por carteira, não por condomínio.

### 3.6 Flow

Execução monitorada de lote + régua.

Responsabilidade:

- vincular lote e régua;
- liberar ou segurar envio;
- agendar mensagens;
- pausar;
- retomar;
- cancelar;
- mostrar contadores;
- expor falhas;
- permitir reenvio de itens com falha.

O Flow responde à pergunta: “como está a execução?”

## 4. Relação entre os objetos

```text
Painel
  └── encaminha itens elegíveis
      ↓
Processamento
  └── prepara casos e libera disponibilidade
      ↓
Disponibilidade
  └── seleciona casos prontos
      ↓
Lote
  └── contém itens, mensagens, anexos, erros e duplicidades
      +
Régua
  └── contém agenda, frequência, canal e template
      ↓
Flow
  └── executa e monitora o envio
```

## 5. Estrutura funcional padrão

### 5.1 Menu do domínio

Para um domínio que use esse modelo, o menu operacional deve priorizar:

1. Painel;
2. Processamento;
3. Flow;
4. Monitor, quando houver uma visão dedicada de agenda/envios.

Lotes e réguas podem existir como telas administrativas ou auxiliares, mas não precisam aparecer como itens principais do menu operacional.

No Pré-Jurídico, a navegação ficou:

- Painel Pré;
- Processamento;
- Flow;
- Monitor.

### 5.2 Header do Flow

A tela Flow pode oferecer atalhos no header para:

- Réguas;
- Lotes;
- Monitor;
- Configurações específicas do domínio.

Esses atalhos são apoio operacional, não a navegação principal do fluxo.

## 6. Estados padrão

### 6.1 Caso ou item de processamento

Cada domínio deve ter seus próprios estados, mas todos devem responder a esta lógica:

- `aguardando_inicio`: item encaminhado, ainda sem caso/processamento iniciado;
- `em_preparacao`: caso em etapas internas;
- `disponivel_flow`: caso cumpriu condição mínima para montagem de lote/Flow;
- `vinculado_flow`: caso já está em lote/Flow;
- `finalizado`: caso concluiu o objetivo do domínio;
- `cancelado` ou `bloqueado`: caso não deve seguir.

No Pré-Jurídico, a disponibilidade é derivada de `procuracao_status = gerada`.

### 6.2 Lote

Estados recomendados:

- `processando`;
- `pendente_aprovacao`;
- `aprovado`;
- `enviado`;
- `parcial`;
- `concluido`;
- `concluido_com_falhas`;
- `cancelado`;
- `erro`.

### 6.3 Mensagem

Estados recomendados:

- `pendente_aprovacao`;
- `aprovada`;
- `agendada`;
- `enviada`;
- `falha`;
- `cancelada`.

### 6.4 Flow

Estados recomendados:

- `pronto`: criado e ainda não liberado;
- `em_execucao`: liberado, com mensagens agendadas/processando;
- `pausado`: temporariamente interrompido;
- `cancelado`: encerrado sem novos disparos;
- `concluido`: todos os itens encerrados sem falha;
- `concluido_com_falhas`: encerrado com uma ou mais falhas.

## 7. Regras de disponibilidade

Um item só pode aparecer em Disponibilidade quando:

- pertence ao escopo de carteira do usuário;
- está na etapa/status correto;
- possui dados mínimos para comunicação;
- ainda não está vinculado a lote/Flow ativo para a mesma finalidade;
- não foi cancelado, finalizado ou bloqueado;
- não geraria duplicidade operacional.

Cada domínio precisa definir:

- condição de entrada;
- condição de saída;
- chave de deduplicação;
- escopo de agrupamento;
- finalidade da comunicação.

## 8. Agrupamento

O agrupamento define como a seleção vira lote.

No Pré-Jurídico:

- agrupamento por carteira;
- uma régua por carteira;
- um lote por carteira/régua;
- um Flow por lote.

Para Cobrança, possibilidades:

- por carteira;
- por condomínio;
- por tipo de cobrança;
- por atraso/faixa de régua;
- por canal.

Para Acordos, possibilidades:

- por carteira;
- por tipo de comunicação;
- por status do acordo;
- por vencimento de parcela;
- por canal.

Cada implementação deve evitar misturar em um mesmo lote itens que precisam de réguas, templates ou canais diferentes.

## 9. Régua

### 9.1 Conteúdo da régua

Uma régua deve definir:

- nome;
- tipo/domínio;
- escopo;
- prioridade;
- status ativo/inativo;
- etapas;
- delay/agendamento;
- canal;
- template/categoria;
- regras de fallback.

### 9.2 Resolução da régua

A resolução deve seguir uma ordem explícita.

Exemplo:

1. régua específica do domínio/escopo;
2. régua da carteira;
3. régua global/fallback.

No Pré-Jurídico, a decisão atual é:

1. régua da carteira;
2. global/fallback.

### 9.3 O que a régua não deve fazer

A régua não deve:

- escolher itens;
- gerar conteúdo;
- aprovar disparo;
- enviar mensagem diretamente.

Ela apenas define agenda, canal e template.

## 10. Lote

### 10.1 Conteúdo do lote

Um lote deve registrar:

- tipo/domínio;
- régua vinculada;
- carteira;
- itens selecionados;
- mensagens geradas;
- anexos;
- total processado;
- total criado;
- total duplicado;
- total com erro;
- observações.

### 10.2 Itens do lote

Cada item deve guardar:

- referência ao caso/cobrança/acordo/parcela;
- status;
- destinatário;
- motivo de pulo, duplicidade ou falha;
- mensagem vinculada;
- metadados necessários para rastrear a origem.

### 10.3 Duplicidade

O lote deve bloquear duplicidade por chave operacional.

Exemplos de chave:

- domínio;
- finalidade;
- destinatário;
- caso ou cobrança;
- data de agenda;
- template/categoria.

## 11. Flow

### 11.1 Criação do Flow

Fluxo padrão:

1. operador seleciona itens na Disponibilidade;
2. sistema agrupa conforme regra do domínio;
3. operador seleciona régua por grupo;
4. sistema cria lote;
5. sistema cria mensagens/anexos;
6. sistema cria Flow;
7. sistema vincula os itens ao lote e ao Flow.

### 11.2 Envio

O botão `Enviar` não deve disparar mensagens imediatamente de forma manual.

Ele deve:

- liberar o Flow;
- calcular agenda pela régua;
- marcar mensagens como `agendada`;
- deixar o dispatcher executar.

### 11.3 Pausa

Ao pausar:

- Flow vira `pausado`;
- mensagens ainda não enviadas não devem ser executadas pelo dispatcher;
- mensagens já enviadas permanecem enviadas.

### 11.4 Retomada

Ao retomar:

- Flow volta para `em_execucao`;
- mensagens pendentes/agendadas continuam elegíveis ao dispatcher;
- agenda pode ser preservada ou recalculada, conforme regra do domínio.

### 11.5 Cancelamento

Ao cancelar:

- Flow vira `cancelado`;
- mensagens não enviadas viram `cancelada`;
- itens pendentes não devem ser disparados;
- itens já enviados preservam histórico.

### 11.6 Reenvio

Reenvio só deve existir para item com falha.

O reenvio deve:

- limpar erro anterior;
- reagendar mensagem;
- registrar log;
- manter o envio dentro do Flow;
- não criar disparo paralelo.

## 12. Monitoramento

Toda tela Flow deve mostrar:

- status do Flow;
- quantidade de itens;
- pendentes;
- agendadas;
- enviadas;
- falhas;
- próximo disparo;
- criado em;
- lote vinculado;
- régua vinculada.

Ao abrir o Flow, deve exibir a fila de itens.

Cada item deve mostrar:

- status;
- identificação do caso;
- destino;
- agenda;
- data de envio quando houver;
- falha/motivo quando houver;
- ação de reenvio quando aplicável.

## 13. Dispatcher

O dispatcher é o único responsável por executar mensagens agendadas.

Regras:

- processar somente mensagens `agendada`;
- respeitar data/hora de envio;
- validar que o Flow está `em_execucao`;
- ignorar Flow pausado ou cancelado;
- registrar sucesso;
- registrar falha com motivo;
- atualizar contadores do Flow;
- executar pós-efeitos do domínio.

Exemplos de pós-efeitos:

- Pré-Jurídico: mensagem enviada marca procuração como `enviada`.
- Cobrança: mensagem enviada pode registrar acionamento de cobrança.
- Acordos: mensagem enviada pode atualizar última comunicação do acordo/parcela.

## 14. Auditoria

Todo domínio deve registrar eventos para:

- item encaminhado;
- caso criado;
- artefato/documento gerado;
- lote criado;
- Flow criado;
- Flow enviado;
- Flow pausado;
- Flow retomado;
- Flow cancelado;
- mensagem enviada;
- mensagem falhada;
- item reenviado;
- conclusão operacional.

## 15. Critérios de aceite do modelo

### Painel

- Lista apenas itens elegíveis ou em acompanhamento.
- Aplica escopo de carteira.
- Permite seleção individual e em massa.
- Encaminha itens ao Processamento.
- Não dispara comunicação final.

### Processamento

- Mostra etapas claras do domínio.
- Permite ações em massa quando fizer sentido.
- Gera ou confirma artefatos necessários.
- Libera itens para Disponibilidade apenas quando prontos.
- Não cria duplicidade de casos.

### Disponibilidade

- Mostra somente itens prontos.
- Exclui itens já vinculados a lote/Flow.
- Permite seleção múltipla.
- Apresenta agrupamento antes da criação do Flow.

### Lote

- Registra conteúdo preparado.
- Registra itens, mensagens, anexos, duplicidades e erros.
- Mantém rastreabilidade por domínio.
- Não define agenda sozinho.

### Régua

- Define agenda, frequência, canal e template.
- Possui fallback claro.
- Não dispara mensagens diretamente.
- É selecionada antes da criação do Flow.

### Flow

- Une lote e régua.
- Exibe contadores e fila.
- Permite enviar, pausar, retomar e cancelar.
- Mostra falhas com motivo.
- Permite reenvio sem criar fluxo paralelo.
- Depende do dispatcher para executar mensagens.

## 16. Aplicação futura em Cobrança

O modelo para cobrança deve definir:

- quais cobranças entram no Painel;
- quais etapas existem no Processamento;
- qual condição torna a cobrança disponível para Flow;
- como agrupar lote;
- qual régua aplicar;
- qual template usar por etapa;
- quais pós-efeitos ocorrem após envio;
- qual chave evita duplicidade.

Sugestão inicial:

```text
Painel Cobrança
  → Processamento Cobrança
  → Disponibilidade de disparo
  → Lote de cobrança
  → Régua de cobrança
  → Flow de cobrança
```

## 17. Aplicação futura em Acordos

O modelo para acordos deve definir:

- quais acordos/parcelas entram no Painel;
- quais eventos exigem comunicação;
- se o processamento é por acordo ou por parcela;
- como lidar com aprovação;
- como agrupar lote;
- qual régua aplicar por tipo de comunicação;
- quais pós-efeitos ocorrem após envio;
- qual chave evita duplicidade.

Sugestão inicial:

```text
Painel Acordos
  → Processamento Acordos
  → Disponibilidade de comunicação
  → Lote de acordos
  → Régua de acordos
  → Flow de acordos
```

## 18. Decisões herdadas do Pré-Jurídico

Devem ser preservadas na replicação:

- Flow é a unidade operacional de envio.
- Lote contém conteúdo.
- Régua contém agenda e template.
- Envio acontece pelo dispatcher.
- Falha aparece no Flow com motivo.
- Reenvio só ocorre dentro do Flow.
- Lotes e réguas podem existir como apoio, mas não precisam dominar o menu operacional.
- Processamento vem antes de Flow na navegação.

## 19. Pontos que cada novo domínio precisa decidir

Antes de implementar Cobrança ou Acordos, definir:

- entidade principal: cobrança, unidade, acordo ou parcela;
- regra de elegibilidade;
- regra de agrupamento;
- etapas do Processamento;
- condição de disponibilidade;
- escopo da régua;
- templates/categorias;
- canais;
- pós-efeitos do envio;
- regras de cancelamento;
- regras de reenvio;
- métricas do monitor;
- eventos de auditoria.
