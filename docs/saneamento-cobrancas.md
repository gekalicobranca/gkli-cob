# Saneamento de Cobranças

Implementação da mesa de limpeza cadastral criada em Gestão > Saneamento de cobranças.

## Fluxo

A importação de cobranças continua bloqueando linhas sem condomínio válido. Quando o condomínio existe, a cobrança pode entrar normalmente e a importação passa a registrar saneamentos cadastrais para revisão posterior.

Tipos gerados:

- `responsavel_divergente`: unidade encontrada, mas o responsável do relatório é diferente do cadastro GKLI.
- `responsavel_ausente`: unidade encontrada, cadastro GKLI sem responsável e relatório com responsável.
- `unidade_nao_encontrada`: unidade não existia e foi criada automaticamente pela importação.
- `possivel_correspondencia`: unidade do relatório bate com unidade cadastrada após normalização, por exemplo `001409` e `1409`.

## Arquivos principais

- `supabase/sql/2026-06-02_saneamento_cobrancas.sql`
- `features/saneamento-cobrancas/service.ts`
- `features/saneamento-cobrancas/queries.ts`
- `features/saneamento-cobrancas/actions.ts`
- `app/app/gestao/saneamento-cobrancas/page.tsx`

## Regras

- Condomínio não encontrado segue como erro bloqueante da importação.
- Responsável não é chave de importação; é apenas dado de saneamento.
- A tela de gestão permite atualizar responsável, confirmar unidade sugerida, resolver ou ignorar pendências.
