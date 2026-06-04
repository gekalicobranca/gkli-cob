# Sprint 6.1 — Fechamento Mensal

## Escopo

Cria o módulo **Gestão → Fechamento mensal** para gestores apurarem períodos de cobrança extrajudicial, com datas de abertura/fechamento definidas manualmente.

## Entregas

- Menu de Gestão com item visível somente para perfis `admin`/`gestor`.
- Rota `/app/gestao/fechamento` com lista de períodos e criação de nova competência.
- Rota `/app/gestao/fechamento/[id]` com:
  - resumo;
  - pagamentos confirmados;
  - despesas de cobrança;
  - comissões;
  - base de faturamento Omie;
  - auditoria;
  - ações de abrir, apurar, conferir, fechar, faturar, reabrir e cancelar.
- SQL completo em `supabase/sql/2026-06-04_fechamento_mensal_61.sql`.
- Server actions e queries em `features/fechamento`.

## Modelo operacional

Status do período:

```txt
rascunho → aberto → em_conferencia → fechado → faturado
```

Também há:

```txt
reaberto
cancelado
```

## Regra de apuração

A apuração usa parcelas de acordo com pagamento confirmado:

```txt
parcelas_acordo.status IN ('paga', 'pago', 'quitada', 'quitado')
parcelas_acordo.data_pagamento entre data_abertura e data_fechamento
```

A base é gravada em snapshots para preservar o fechamento após conferência.

## Observação

As tabelas de fechamento são novas. Rode o SQL antes de acessar o módulo em produção.
