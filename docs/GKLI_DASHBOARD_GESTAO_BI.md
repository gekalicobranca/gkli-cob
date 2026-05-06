# GKLI Cobrança — Dashboard de Gestão BI

## O que foi aplicado

A tela `/app/dashboard` foi transformada em um dashboard gerencial estilo BI, mantendo o padrão visual GKLI monocromático e sem adicionar dependências externas de gráficos.

## Blocos do dashboard

- Semáforos gerenciais no header:
  - Acordos em risco
  - Judicialização
  - Carteira sem toque
  - Aging +90 dias
- KPIs executivos:
  - Carteira em aberto
  - Valor acordado
  - Recuperação estimada
  - Conversão
- Gauge de saúde da carteira.
- Evolução mensal com barras comparativas:
  - Aberto
  - Acordado
- Aging da inadimplência.
- Distribuição financeira por status das cobranças.
- Funil de recuperação.
- Ranking de condomínios com maior impacto financeiro.
- Painel de acordos sob pressão.

## Arquivos alterados

- `app/app/dashboard/page.tsx`
- `features/dashboard/queries.ts`

## Observações técnicas

- Os gráficos foram feitos com SVG/CSS/Tailwind, sem Recharts, Chart.js ou bibliotecas externas.
- A tela continua sendo Server Component.
- As consultas respeitam o escopo de carteira via `applyCarteiraScope`.
- O dashboard usa dados reais de `cobrancas`, `acordos` e `parcelas_acordo` via relacionamento dentro de acordos.
- O dashboard é gerencial e não substitui o cockpit operacional.

## Próxima evolução recomendada

- filtros por carteira, condomínio, período e status;
- drill-down por condomínio;
- exportação PDF/CSV;
- metas mensais e comparação contra meta;
- painel por operador quando o relacionamento de operador estiver consolidado no banco.
