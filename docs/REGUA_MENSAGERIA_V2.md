# GKLI Cobrança — Régua/Mensageria v2

## Regra de produto implementada

Cada condomínio indica em `condominios.inicio_cobranca_dias` com quantos dias após o vencimento a cobrança entra na régua.

Exemplo:

- Condomínio A: `inicio_cobranca_dias = 30`
- Condomínio B: `inicio_cobranca_dias = 60`

A cobrança só vira elegível quando:

```ts
dias_em_atraso >= condominios.inicio_cobranca_dias
```

## Régua padrão

A régua continua com padrão fixo de etapas:

- D+0 dentro da régua: aviso leve
- D+3 dentro da régua: reforço
- D+7 dentro da régua: urgência
- D+15 dentro da régua: pré-jurídico

Importante: D+0 aqui significa o primeiro dia após a cobrança entrar na régua, não necessariamente o vencimento original.

## Ajustes por condomínio

Campos adicionados ao condomínio:

- `inicio_cobranca_dias`
- `intensidade_regua`: `leve`, `medio`, `agressivo`
- `regua_cobranca_id`
- `regua_acordo_id`

## Arquivos adicionados

- `features/regua/engine.ts`
- `features/regua/templates.ts`
- `features/regua/queries.ts`
- `features/regua/actions.ts`
- `features/regua/types.ts`
- `app/api/regua/processar/route.ts`
- `database/2026-05-05_regua_padrao_e_motor.sql`

## Vercel Cron

Endpoint:

```txt
POST /api/regua/processar
```

Variável opcional:

```txt
REGUA_CRON_SECRET=
```

Se definida, enviar header:

```txt
Authorization: Bearer <REGUA_CRON_SECRET>
```
