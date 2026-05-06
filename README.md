
# GKLI Cobrança — Conectcon V2 + Menu Fix

## Inclui

### Conversão de Relatório
- parser Conectcon bloco/unidade
- leitura por:
  - Unidade:
  - Recibo
  - Vencimento
  - Total

### Sidebar
- fontes mais leves
- menor peso visual
- padrão próximo ao CRM
- mantém colapso do menu

## Substituir

### Parser
features/conversao-relatorio/lib/parse-conectcon.ts

### Ajustes visuais
components/layout/app-shell.tsx
