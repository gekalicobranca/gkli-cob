# Fonte de Verdade - Auditoria, Status e Parcelas

Data: 2026-06-05

## 1. Objetivo

Fechar a decisao tecnica e operacional sobre quais tabelas/campos o app deve tratar como fonte de verdade para:

- auditoria e timeline;
- status de cobrancas, acordos, mensagens e lotes;
- parcelas de acordo e parcelas de cobranca.

Este item existe para reduzir duplicidade, evitar leituras divergentes entre telas e impedir que novas regras sejam criadas sobre tabelas legadas.

## 2. Decisoes de arquitetura

### 2.1 Auditoria

Fonte primaria para narrativa operacional:

- `timeline_operacional`

Uso:

- historico exibido ao operador;
- eventos de mudanca de status;
- acoes manuais relevantes;
- eventos de automacao que afetam a rotina operacional.

Fonte primaria para auditoria estruturada:

- `auditoria_eventos`

Uso:

- trilha tecnica estruturada;
- payload antes/depois quando houver mudanca sensivel;
- apoio a investigacao, compliance e relatorios internos.

Compatibilidade/legado:

- `audit_logs`
- `auditoria_operacional`
- `eventos_operacionais`

Uso:

- leitura historica ou fallback controlado;
- nenhuma regra nova deve escrever diretamente nessas tabelas sem decisao explicita.

Regra de escrita:

- toda nova escrita operacional deve passar por `registrarEventoOperacional`;
- `registrarEventoOperacional` deve escrever primeiro em `timeline_operacional`;
- `auditoria_eventos` deve ser gravada para eventos sensiveis ou estruturados;
- fallback nao deve esconder falha critica quando o evento for obrigatorio.

### 2.2 Status de cobranca

Campos canonicos:

- `cobrancas.status_operacional`: etapa de trabalho;
- `cobrancas.status_financeiro`: situacao de pagamento.

Campo legado/compatibilidade:

- `cobrancas.status`

Regra:

- telas, filtros, dashboards e automacoes devem ler `status_operacional` para fluxo de trabalho;
- telas financeiras e relatorios de pagamento devem ler `status_financeiro`;
- `status` pode ser mantido sincronizado por compatibilidade, mas nao deve orientar regra nova.
- quando constraint legada de `cobrancas.status` exigir valores antigos com espaco, a RPC deve adaptar somente `status`; `status_operacional` permanece em snake_case.

Valores canonicos de `status_operacional`:

- `novo`
- `em_cobranca_ativa`
- `em_negociacao`
- `acordo_firmado`
- `acordo_efetivado`
- `judicializado`
- `suspenso`

Valores canonicos de `status_financeiro`:

- `em_aberto`
- `parcial`
- `quitado`
- `vencido`
- `renegociado`

### 2.3 Status de acordo

Campos canonicos:

- `acordos.status`: estado operacional/contratual do acordo;
- `acordos.status_financeiro`: situacao financeira consolidada;
- `acordos.fluxo_status`: etapa de formalizacao, aceite, boletos e rompimento assistido.

Regra:

- `status` deve refletir a vida do acordo;
- `status_financeiro` deve ser derivado de entrada e parcelas;
- `fluxo_status` deve ser limitado ao fluxo de formalizacao e nao substituir `status`.

Valores canonicos de `acordos.status`:

- `ativo`
- `em_dia`
- `em_atraso`
- `vencido`
- `quebrado`
- `quitado`
- `cancelado`
- `renegociado`

### 2.4 Parcelas

Fonte de verdade para parcelas de acordo:

- `parcelas_acordo`

Legado/compatibilidade:

- `acordos_parcelas`

Status internos de parcela de acordo:

- `aberta`
- `paga`
- `vencida`
- `cancelada`

Regra:

- nenhuma regra financeira nova deve consultar ou escrever em `acordos_parcelas`;
- consultas de acordo, relatorios, exportacoes e jobs devem usar `parcelas_acordo`;
- `acordos_parcelas` so pode ser usado em migracao, leitura historica ou ponte temporaria documentada.
- como `parcelas_acordo` e `acordos_parcelas` estavam vazias no live em 2026-06-05, nao ha migracao de dados pendente;
- `acordos_parcelas` deve ficar somente leitura via `supabase/sql/2026-06-05_bloquear_acordos_parcelas_legado.sql`.

Fonte de verdade para parcelas de cobranca:

- `cobranca_parcelas`

Regra:

- valores detalhados por competencia/recibo ficam em `cobranca_parcelas`;
- totais consolidados permanecem em `cobrancas`;
- importacao/conversao deve preservar origem em payload ou campos de origem.

## 3. Escopo de desenvolvimento

### Fase 0 - Diagnostico seguro

Objetivo: medir impacto antes de alterar comportamento.

Tarefas:

- listar todas as leituras e escritas em `timeline_operacional`, `auditoria_eventos`, `audit_logs`, `auditoria_operacional` e `eventos_operacionais`;
- listar todas as leituras e escritas de `cobrancas.status`, `status_operacional` e `status_financeiro`;
- listar todas as leituras e escritas em `parcelas_acordo` e `acordos_parcelas`;
- comparar constantes TypeScript com constraints SQL aplicadas no Supabase live;
- gerar matriz de risco por arquivo.

Entrega:

- relatorio curto com arquivos afetados, tipo de uso e recomendacao.

Criterios de aceite:

- nenhum arquivo alterado;
- divergencias classificadas como P0, P1 ou P2;
- lista de SQL/migracoes que precisam estar aplicadas antes das fases seguintes.

### Fase 1 - Contrato canonico no codigo

Objetivo: tornar a decisao visivel e reutilizavel no app.

Tarefas:

- consolidar enums e normalizadores em `lib/core/status.ts` e `lib/core/status-normalizers.ts`;
- criar helpers de leitura para status de cobranca e acordo, evitando `row.status ?? row.status_operacional` espalhado;
- documentar no codigo quando `status` for sincronizacao legada;
- revisar labels para remover acentos corrompidos quando possivel sem alterar valores internos.

Entrega:

- modulo canonico de status;
- helpers de leitura usados pelos principais dashboards e detalhes.

Criterios de aceite:

- novas telas nao precisam conhecer campo legado;
- TypeScript aponta uso indevido de status quando possivel;
- valores internos continuam sem acento e em snake_case.

### Fase 2 - Auditoria centralizada

Objetivo: impedir novas escritas paralelas de auditoria.

Tarefas:

- ajustar `registrarEventoOperacional` para explicitar duas categorias: evento narrativo e evento auditavel;
- definir quais eventos gravam tambem `auditoria_eventos`;
- substituir escritas diretas em auditoria por helper central, onde houver;
- adicionar opcao `required` somente para eventos que nao podem ser perdidos;
- padronizar `origem` com valores como `app`, `manual`, `cron`, `api`, `importacao`, `webhook`.

Entrega:

- API unica de eventos operacionais;
- tabela de eventos sensiveis que exigem auditoria estruturada.

Criterios de aceite:

- mudanca de status de cobranca registra timeline com estado anterior/novo;
- mudanca financeira de acordo/parcela registra evento auditavel;
- falha em fallback nao bloqueia operacao comum, mas bloqueia evento marcado como obrigatorio.

Implementacao inicial:

- `RegistrarEventoInput` recebeu `auditavel`, `origem`, `antes` e `depois`;
- `registrarEventoOperacional` grava `auditoria_eventos` quando `auditavel` for verdadeiro;
- eventos sensiveis de cobranca, acordo e parcela foram marcados com `origem: manual`;
- `transicionarEstadoOperacional` passou a ser auditavel com `origem: sistema`;
- `transicionarEstadoOperacional` busca o estado anterior antes de atualizar cobranca/acordo e registra anterior/novo;
- helper/eventos especificos de mensagens ficam para a frente `Mensageria 2.0`.

### Fase 3 - Status de cobranca e acordo

Objetivo: remover ambiguidade operacional.

Tarefas:

- trocar leituras de tela/filtro para `status_operacional` quando o assunto for cobranca;
- trocar leituras financeiras para `status_financeiro`;
- manter escrita sincronizada em `cobrancas.status` apenas como compatibilidade;
- revisar `transicionarEstadoOperacional` para atualizar estado depois de validar permissao e capturar estado anterior;
- garantir que acordo use `status`, `status_financeiro` e `fluxo_status` com responsabilidades separadas;
- documentar diferenca entre `acordo_firmado` e `acordo_efetivado`.

Entrega:

- telas e jobs usando campos canonicos;
- transicoes centrais com auditoria.

Criterios de aceite:

- dashboards de cobranca nao mudam resultado quando `cobrancas.status` diverge;
- detalhe da cobranca mostra status operacional e financeiro de forma consistente;
- criacao/rompimento/quitacao de acordo atualiza cobranca vinculada conforme regra documentada.

### Fase 4 - Parcelas de acordo

Objetivo: garantir que `parcelas_acordo` seja a unica base operacional.

Tarefas:

- revisar queries e exportacoes que ainda consultam `acordos_parcelas`;
- migrar leituras restantes para `parcelas_acordo`;
- bloquear novas escritas em `acordos_parcelas` no codigo;
- criar script SQL de diagnostico para comparar contagens entre legado e fonte canonica;
- decidir se `acordos_parcelas` fica somente leitura ou sera removida futuramente.

Entrega:

- acordo, relatorios, jobs e exportacoes consumindo `parcelas_acordo`;
- documento de migracao/compatibilidade.

Criterios de aceite:

- pagamento, vencimento, atraso e quitacao usam `parcelas_acordo`;
- `checkAcordosStatus` nao depende de tabela legada;
- exportacao de acordos traz parcelas da fonte canonica.

### Fase 5 - SQL e verificacao live

Objetivo: alinhar banco, app e documentacao.

Tarefas:

- revisar constraints/checks de status no Supabase;
- adicionar constraints ausentes somente apos normalizar dados existentes;
- criar views auxiliares se for necessario ler legado sem duplicar regra;
- atualizar comentarios SQL indicando fonte de verdade;
- validar RLS nas tabelas de auditoria e parcelas.

Entrega:

- migracoes incrementais seguras;
- roteiro de validacao no Supabase live.

Criterios de aceite:

- migracoes rodam de forma idempotente;
- dados antigos fora do padrao sao reportados antes de qualquer bloqueio;
- RLS nao impede evento operacional necessario.

## 4. Ordem recomendada

1. Fase 0: diagnostico somente leitura.
2. Fase 1: contrato canonico no codigo.
3. Fase 2: auditoria centralizada.
4. Fase 3: status de cobranca e acordo.
5. Fase 4: parcelas de acordo.
6. Fase 5: constraints e validacao live.

## 5. Backlog inicial

### P0

- Confirmar schema live atual para `timeline_operacional`, `auditoria_eventos`, `eventos_operacionais`, `audit_logs` e `auditoria_operacional`.
- Confirmar se `parcelas_acordo` cobre todos os casos usados hoje por `acordos_parcelas`. Concluido: ambas as tabelas estavam vazias no live; sem migracao de dados.
- Corrigir leituras que tratam `cobrancas.status` como fonte operacional. Concluido nos principais consumidores via helper canonico.
- Validar que `transicionarEstadoOperacional` registra estado anterior e novo. Concluido para cobranca e acordo.

### P1

- Centralizar helper de leitura de status de cobranca.
- Definir lista de eventos que exigem escrita em `auditoria_eventos`. Parcial: cobranca, acordo e parcelas.
- Padronizar `origem` dos eventos. Parcial: eventos manuais e transicao central.
- Criar diagnostico SQL de status fora do conjunto canonico. Criado em `supabase/sql/2026-06-05_diagnostico_fonte_verdade.sql`.

### P2

- Remover labels/textos corrompidos por encoding em constantes e docs.
- Criar view de compatibilidade para legado, se necessario.
- Atualizar relatorios e exportacoes com nomenclatura final.

## 6. Checklist de PR

Cada PR desse tema deve responder:

- Qual fonte de verdade foi usada?
- Alguma tabela legada continuou sendo lida? Por que?
- O fluxo registra timeline?
- O fluxo registra auditoria estruturada quando sensivel?
- O status anterior e novo foram preservados?
- A permissao por carteira foi aplicada?
- Existe risco de quebrar dado historico?
- A mudanca foi validada contra schema live ou ficou pendente?

## 7. Fora de escopo por enquanto

- Remover fisicamente tabelas legadas.
- Reescrever todo historico antigo.
- Trocar provedor de mensageria.
- Alterar formula financeira de juros, multa ou correcao.
