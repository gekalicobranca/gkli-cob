# Patch Notes — Conversão de Relatório V1

Arquivos adicionados:

- `app/app/conversao-relatorio/page.tsx`
- `features/conversao-relatorio/components/conversion-upload-card.tsx`
- `features/conversao-relatorio/components/recognized-templates-card.tsx`
- `features/conversao-relatorio/lib/parse-conectcon.ts`
- `database/2026-05-05_conversao_relatorio_v1.sql`
- `CONVERSAO_RELATORIO_V1.md`

Menu:

O módulo deve aparecer em **Base Cadastral**, logo abaixo de **Importações**.

Se o `AppShell` atual tiver lista hardcoded diferente, adicionar manualmente:

```ts
{
  label: "Conversão de Relatório",
  href: "/app/conversao-relatorio",
  icon: "document"
}
```
