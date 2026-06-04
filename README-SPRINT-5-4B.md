# GKLI Cobrança — Acordos Sprint 5.4B Lite

## Entregas

- Central de Aprovações do síndico em `/app/acordos/aprovacoes`.
- Controle de boletos em `/app/acordos/boletos`.
- Rompimento assistido na ficha do acordo.
- Motivos padronizados para rejeição e rompimento.
- Atualização de timeline operacional via eventos.

## Decisões funcionais

- Não foi criada aprovação interna para manter o fluxo leve.
- Boletos usam `fluxo_status` para evitar novas colunas obrigatórias.
- Rompimento assistido atualiza cobranças vinculadas conforme destino: retomar cobrança, suspender ou judicializar.

## Observação técnica

O pacote foi montado a partir da Sprint 5.4A. Não foi executado build porque o ZIP de origem não contém `node_modules`.
