# GKLI Cobrança — Mensageria/Régua v6

## Status da entrega

Implementação plugada no projeto GKLI Cobrança, baseada no pacote `gkli-cobranca-build-review-v4.zip`.

## Validação local neste ambiente

- Foi feita inspeção estática dos arquivos alterados.
- A instalação de dependências neste ambiente não ficou disponível de forma estável para concluir `tsc`/`next build` dentro do tempo de execução.
- O pacote foi montado sem `node_modules` e sem `.next`.

## Como validar localmente

```bash
rm -rf .next node_modules
npm install
npm run typecheck
npm run build
```

## Variáveis novas

```env
REGUA_CRON_SECRET=
```

`REGUA_CRON_SECRET` é opcional. Se configurado, o endpoint `/api/regua/processar` exige header `Authorization: Bearer <secret>`.

## Migration obrigatória

Rode no Supabase:

```txt
database/2026-05-05_regua_padrao_e_motor.sql
```
