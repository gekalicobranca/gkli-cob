# Sprint 3 — manutenção e armazenamento

**Data da revisão:** 23/11/2026
**Escopo:** inspeção do catálogo e estatísticas, validação local focada e publicação autorizada no GKLI - COB em 23/11/2026. Alteração limitada aos parâmetros de autovacuum.

## Achados

- Não foram encontrados índices públicos com definições exatamente duplicadas.
- Há índices sem leituras registradas na janela observada, mas isso, isoladamente, não comprova que sejam dispensáveis. Índices de chave primária/unique e índices usados raramente podem não aparecer como lidos; nenhum índice foi removido.
- `acordo_homologacoes_adm` ocupa aproximadamente 87 MB, dos quais cerca de 86 MB em TOAST, com 432 linhas estimadas. A coluna `documento` é `bytea`, compatível com armazenamento de documentos binários no banco.
- `conversoes_relatorio` ocupa aproximadamente 86 MB, incluindo cerca de 84 MB em TOAST, para 1.793 linhas estimadas. `preview_json` e `inconsistencias_json` são payloads JSONB. As estatísticas indicam atualizações acumuladas e vacuum anterior relativamente antigo.
- `mensagens` ocupa aproximadamente 66 MB e também tem dados TOAST relevantes; `auditoria_eventos` ocupa cerca de 90 MB, incluindo aproximadamente 45 MB em TOAST.
- A amostra de estatísticas mostrou proporção relevante de tuplas mortas em `acordo_homologacoes_adm`, `conversoes_relatorio`, `captacao_historica_sindico`, `cobrancas` e `mensagens`. São estimativas sujeitas à atividade e ao ciclo de coleta de estatísticas.

## Alteração preparada

A migration `20261123132723_tune_autovacuum_payload_churn_tables.sql` define `autovacuum_vacuum_scale_factor = 0.05` nas cinco tabelas acima. Para `acordo_homologacoes_adm`, `conversoes_relatorio` e `mensagens`, define também o mesmo limite para TOAST, onde se concentram dados externos à página principal. O arquivo foi alinhado à versão registrada pelo MCP; substitui o candidato 20261123131747, que não deve ser reaplicado.

Com o limite padrão de 20%, algumas tabelas pequenas podem acumular centenas de tuplas mortas antes do vacuum automático. O fator de 5% reduz esse atraso; o threshold absoluto padrão continua valendo. A mudança pode aumentar a frequência de vacuum, mas não exclui registros nem executa `VACUUM FULL`.

## Limites e próximos passos

- Validação local em PGlite passou: parâmetros nas cinco tabelas e três TOAST, RLS e registros sintéticos preservados e reexecução. Esse ensaio não mede o daemon de autovacuum nem substitui teste de carga; Docker/Podman continuam indisponíveis.
- Aplicada via MCP no GKLI - COB, com lock_timeout local de 5 segundos. A consulta posterior confirmou os oito parâmetros e preservação de RLS/grants. A operação não executou VACUUM FULL, remoção de dados, índices ou reescrita de tabelas.
- Reversão dos parâmetros: ALTER TABLE ... RESET (autovacuum_vacuum_scale_factor) nas cinco tabelas; nas três com TOAST, incluir toast.autovacuum_vacuum_scale_factor. As opções estavam ausentes antes desta publicação; executar reversão somente por procedimento autorizado.
- Não há redução de espaço ou latência medida nesta publicação. A frequência efetiva e uso de I/O dependem da atividade e da configuração global; observar as próximas execuções e estatísticas.
- A possibilidade de mover `acordo_homologacoes_adm.documento` para Supabase Storage exige uma decisão específica sobre retenção legal, acesso privado, RLS, auditoria, ciclo de vida e compatibilidade da aplicação. Não foi alterada nesta sprint.
- Os índices sem leitura devem ser observados por mais tempo e confrontados com consultas e períodos operacionais antes de qualquer remoção.
