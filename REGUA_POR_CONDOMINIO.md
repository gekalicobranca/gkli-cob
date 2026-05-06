# Régua por condomínio — revisão aplicada

Implementado o comportamento operacional em que cada condomínio controla quando uma cobrança entra na régua.

## Regra

Uma cobrança fica elegível quando:

```txt
dias_em_atraso >= condominios.inicio_cobranca_dias
```

Status excluídos da régua:

- acordo firmado
- acordo efetivado
- judicializado
- suspenso

## Arquivos alterados

- `features/mensageria/queries.ts`
  - adiciona `listCobrancasElegiveisParaRegua(scope)`.
  - normaliza joins `condominios` e `unidades`.
  - calcula `dias_em_atraso`, `dias_para_inicio_regua` e `elegivel_desde`.

- `features/mensageria/actions.ts`
  - adiciona `gerarMensagensReguaCondominio()`.
  - gera mensagens apenas para cobranças elegíveis conforme o D+ do condomínio.

- `app/app/mensageria/page.tsx`
  - mostra cobranças aptas para régua.
  - mostra cards de elegíveis, mensagens pendentes e régua média.
  - adiciona botão “Gerar lote da régua”.

- `database/2026-05-05_regua_por_condominio.sql`
  - garante o campo `condominios.inicio_cobranca_dias`.

## Observação técnica

O pacote foi mantido focado no módulo de mensageria/régua e não altera o padrão visual do CRM.
