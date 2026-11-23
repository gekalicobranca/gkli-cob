# Sprint 2 — redução de consultas no painel TV/mobile

**Revisão:** 23/11/2026
**Projeto de referência:** GKLI - COB (`vjcmotflmcczoepflhwc`)
**Modo:** código alterado localmente; nenhuma consulta mutável, migration ou índice foi aplicado no Supabase hospedado.

## Achado e alteração

As estatísticas de aproximadamente 38 dias mostraram consultas frequentes e lentas sobre `cobrancas` (médias de 1,1–1,2 s), `parcelas_acordo` (1,6 s) e `acordo_cobrancas` (1,8 s). Na rota mobile de resultados, a seleção opcional de carteira/condomínio era aplicada somente depois de carregar todas as páginas dentro do escopo autorizado do usuário.

Em `features/dashboard/tv-actions.ts`, a seleção agora também restringe no banco as leituras de cobranças, acordos, parcelas, bloqueios jurídicos, vínculos, condomínios e referências de pagamento. A lista de carteiras é limitada quando uma carteira específica foi pedida. O escopo de carteiras permitido continua sendo aplicado; o filtro em memória permanece como verificação final. Chamadas sem seleção, como o painel TV geral, preservam os mesmos filtros.

## Verificação

- `npx tsx --test scripts/validate-tv-dashboard.ts`: 17 casos passaram.
- `npx eslint features/dashboard/tv-actions.ts`: passou.
- `npm run typecheck`: passou.
- Não há medição comparativa de latência nesta etapa. A stack Supabase local não iniciou porque Docker/Podman não estão instalados/disponíveis neste ambiente.

## Pendências de banco

Não criei índices com base apenas nos 170 alertas de FKs sem índice ou nos índices sem leitura. A próxima revisão deve comparar planos `EXPLAIN (ANALYZE, BUFFERS)` no ambiente local com as consultas de `cobrancas`, `parcelas_acordo` e `acordo_cobrancas`; depois, escolher poucos índices com evidência e medir seu custo de escrita. A listagem da Sprint 1 também permanece sem validação integrada ao Supabase local enquanto a stack local estiver indisponível.
