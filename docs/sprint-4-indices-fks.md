# Sprint 4 — índices e chaves estrangeiras

**Data da revisão:** 23/11/2026
**Escopo:** revisão somente leitura do catálogo de índices do projeto GKLI - COB e cruzamento com padrões de consulta presentes no checkout local. Sem DDL executado no banco hospedado.

## Resultado

Não foi criada migration de índices nesta etapa. O projeto já contém cobertura ampla, com índices compostos e parciais para cobranças, parcelas, lotes e logs de mensageria. Sem planos `EXPLAIN (ANALYZE, BUFFERS)` num banco local representativo, adicionar ou remover índices seria especulativo e pode aumentar custo de escrita ou regressar consultas existentes.

### Relações revisadas

- **`cobrancas`:** índices por carteira, condomínio, unidade, vencimento, status operacional/financeiro e combinações voltadas a cockpit, funil, importação e régua. Há índices compostos de cobrança bastante próximos, mas a seletividade e os filtros efetivos precisam ser comparados com planos e estatísticas de uso antes de consolidar qualquer um.
- **`parcelas_acordo`:** índices em `(acordo_id, status, vencimento)` e `(acordo_id, status, vencimento, numero)`, além dos índices por status/vencimento e acordo. Não adicionar um índice genérico em `acordo_id` sem medir a utilidade marginal frente aos compostos.
- **`acordo_cobrancas`:** índices individuais por `acordo_id` e `cobranca_id`, mais índice único em `(acordo_id, cobranca_id)`; não foi identificado um FK óbvio sem cobertura neste vínculo.
- **`lotes`:** vários índices sobrepostos por carteira/tipo/status/data e por status/tipo/data. A maior parte das consultas encontradas está coberta em forma geral ou parcial; reduzir redundância requer comparar uso e planos.
- **`mensageria_logs`:** índices por lote, mensagem, carteira, evento e data, com variantes compostas. Evitar criar mais índices até identificar consultas lentas específicas.

## Restrições da validação

- A busca por `psql`, Docker e Podman não encontrou binários disponíveis nesta sessão. Assim, não foi possível obter planos locais nem executar `EXPLAIN (ANALYZE, BUFFERS)`.
- O catálogo do banco hospedado foi consultado em modo somente leitura para listar definições de índices das cinco relações citadas. Não foram lidos dados pessoais ou financeiros; não houve escrita remota.
- As estatísticas anteriores de índices sem leitura são uma janela agregada e não bastam para remoção: reinícios/reset, tarefas mensais e índices de constraints podem não refletir o uso normal.
- Esta revisão não reconstruiu integralmente todas as FKs do catálogo; os vínculos acima são o subconjunto relevante às consultas e relações investigadas.

## Próximo passo para medir

1. Disponibilizar PostgreSQL local com versão e extensões compatíveis, usando fixture anonimizada/representativa ou seed sintético de volume adequado.
2. Capturar consultas reais prioritárias a partir dos módulos do checkout, preservando os filtros de carteira e os filtros canônicos de cobrança.
3. Rodar `EXPLAIN (ANALYZE, BUFFERS, WAL, SETTINGS)` antes/depois de uma hipótese por vez, com `ANALYZE` do conjunto de dados e mais de uma distribuição seletiva.
4. Conferir, no catálogo local, FKs sem prefixo de índice compatível; validar cada candidato contra SQL e políticas RLS efetivas.
5. Criar migration local somente para candidatos que mostrem redução consistente de tempo/leitura sem impacto desproporcional em escrita ou tamanho.
6. Revisar e medir consolidamento/remoção de índices em etapa separada, com janela suficiente de observação e plano de rollback.

## Candidatos de consulta para o próximo ensaio

- Listagem paginada e catálogo de cobranças em `features/cobrancas/queries.ts`.
- Histórico de cobrança, acordo e mensagens por unidade em `features/unidades/queries.ts`.
- Painel TV/mobile: leituras de cobranças, parcelas, acordos e vínculos em `features/dashboard/tv-actions.ts`.
- Saúde do sistema: falhas de mensagens, lotes pendentes e parcelas vencidas em `features/saude-sistema/queries.ts`.

Esses são alvos de medição, não uma afirmação de que algum índice específico esteja faltando.
