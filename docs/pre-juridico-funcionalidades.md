# Pré-Jurídico — funcionalidades disponíveis

Atualizado em 26/08/2026.

Este arquivo é um resumo operacional. A especificação funcional completa está em:

[Pré-Jurídico — especificação funcional](./pre-juridico-especificacao-funcional.md)

## Navegação atual

- Painel Pré: identifica cobranças elegíveis e permite encaminhamento ao pré-jurídico.
- Processamento: organiza laudo, certidão, procuração, confirmação jurídica e distribuição.
- Flow: monta lote + régua e monitora envios, agenda, falhas e reenvios.
- Lotes: lista lotes pré-jurídicos já gerados.
- Régua: configura a régua pré-jurídica por carteira.

## Funcionalidades disponíveis

### Painel Pré

- [x] Elegibilidade por carteira e condomínio habilitados.
- [x] Cálculo de atraso conforme regra D+ do condomínio.
- [x] Bloqueio de cobranças vinculadas a acordo.
- [x] Filtros por busca, carteira, condomínio, vencimento e situação.
- [x] Agrupamento por condomínio.
- [x] Seleção individual, por condomínio e geral.
- [x] Encaminhamento de cobranças elegíveis ao pré-jurídico.

### Processamento

- [x] Criação de caso pré-jurídico por unidade.
- [x] Agrupamento das cobranças abertas da unidade.
- [x] Geração de laudo.
- [x] Andamento da certidão: pendente, solicitada e recebida.
- [x] Geração de procuração em nova aba.
- [x] Seleção múltipla de procurações.
- [x] Atualização em massa do status da procuração.
- [x] Confirmação do jurídico.
- [x] Controle de distribuição ao jurídico.
- [x] Judicialização automática das cobranças abertas ao distribuir.

### Flow

- [x] Disponibilidade de procurações geradas e ainda sem lote/Flow.
- [x] Montagem por carteira.
- [x] Seleção de régua na linha do lote.
- [x] Criação de Flow a partir de lote + régua.
- [x] Envio, pausa, retomada e cancelamento do Flow.
- [x] Monitoramento dos envios no próprio Flow.
- [x] Contadores de pendentes, agendadas, enviadas e falhas.
- [x] Fila de envio com status, caso, destino, agenda e ação.
- [x] Exibição do motivo de falha.
- [x] Reenvio de item com falha pelo Flow.

### Régua

- [x] Réguas exclusivas do tipo jurídico.
- [x] Configuração por carteira.
- [x] Etapas com delay, canal e template.
- [x] Categorias de template para carteira, administradora e síndico.

### Lotes

- [x] Listagem separada dos lotes pré-jurídicos.
- [x] Filtros por lote, régua, status e resultado.
- [x] Indicadores de mensagens, pendências e erros.

## Decisões funcionais vigentes

- A régua pré-jurídica é por carteira, não por condomínio.
- Lote contém conteúdo e mensagens.
- Régua contém agenda, frequência e template.
- Flow é a execução monitorada de lote + régua.
- O envio acontece pelo dispatcher automático, não por disparo direto fora do Flow.
- O monitoramento operacional de envio fica na seção `Flows` da tela Flow.
