# Conversão de Relatório V1 — GKLI Cobrança

## Decisão de produto

O módulo fica em **Base Cadastral**, logo abaixo de **Importações**, com nome oficial:

**Conversão de Relatório**

## Objetivo

Transformar relatórios de inadimplência das administradoras em:

- 1 cobrança consolidada por unidade
- N parcelas/vencimentos vinculados à cobrança

Isso preserva simplicidade operacional sem perder inteligência para régua de cobrança.

## V1

Inclui:

- Página `/app/conversao-relatorio`
- Preview client-side para relatório Conectcon XLS/HTML
- Parser inicial em `features/conversao-relatorio/lib/parse-conectcon.ts`
- Migration SQL para:
  - `conversoes_relatorio`
  - `cobranca_parcelas`
  - vínculo opcional em `cobrancas`

## Próxima etapa

Implementar ação de confirmação:

1. salvar `conversoes_relatorio`
2. localizar/criar cobrança por unidade
3. inserir parcelas em `cobranca_parcelas`
4. recalcular `cobrancas.valor_total`
5. deixar cobrança pronta para régua, usando o vencimento mais antigo aberto
