# Sprint 1 — segurança de funções, Auth e PostgreSQL

**Revisão:** 23/11/2026
**Projeto avaliado:** GKLI - COB (`vjcmotflmcczoepflhwc`)
**Modo desta etapa:** correção de search_path validada localmente e aplicada ao GKLI - COB em 23/11/2026, sob autorização de publicação. Auth e upgrade gerenciado continuam pendentes.

## Concluído localmente

- Publicada a migration `20261123122552_harden_cnpj_function_search_path.sql` para fixar `search_path = ''` em `public.normalizar_cnpj(text)` e `public.cnpj_valido(text)`. O nome local foi alinhado ao timestamp registrado pelo MCP no histórico remoto, substituindo o candidato 20261123121745; não reaplicar os dois nomes.
- As funções permanecem `SECURITY INVOKER`; a migration não altera grants nem a lógica de validação.
- O candidato foi criado pelo Supabase CLI 2.117.0. A validação usou PostgreSQL embarcado PGlite, sem Docker: corpos e grants preservados, SECURITY INVOKER, search_path vazio, equivalência de casos numéricos/alfanuméricos, inválidos e nulos, chamadas com search_path da sessão restrito e reexecução local. A aplicação remota foi feita via MCP apply_migration exclusivamente para estas duas funções.
- A consulta posterior confirmou search_path vazio nas duas funções, SECURITY INVOKER e grants preservados. Os casos sintéticos passaram também em consulta somente leitura no alvo. O security advisor não retornou mais function_search_path_mutable. Nenhum registro financeiro ou cadastral foi alterado.

## Pendências operacionais

### Proteção contra senhas vazadas

A auditoria encontrou a proteção desativada. Ela é uma configuração do Supabase Auth, não uma migration SQL nem uma opção disponível no `supabase/config.toml` deste checkout. Habilitar no Dashboard em **Authentication → Settings → Password security**, revisar os fluxos de criação e alteração de senha e confirmar que o plano dá suporte ao recurso. Não alterar o requisito mínimo de senha nesta etapa.

### Atualização do PostgreSQL gerenciado

Na auditoria, o projeto hospedado estava em PostgreSQL 17.6.1.111. O changelog do Supabase informa que a versão 17.11 corrige 44 CVEs. Antes de solicitar a atualização:

1. Revisar extensões, operadores customizados e índices de `ltree`/`btree_gist`.
2. Identificar dados `pgcrypto` eventualmente cifrados com algoritmos legados e preparar recriptografia, se aplicável.
3. Confirmar backup/PITR e procedimento de restauração; ensaiar compatibilidade e reconstrução de índices no ambiente de desenvolvimento.
4. Planejar janela e validar aplicação, consultas e workers depois da atualização.

O upgrade não foi iniciado. A atualização do mecanismo gerenciado deve ser feita pelo fluxo de manutenção do Supabase após essa revisão.

## Verificação ainda necessária

- Validação focada e conferência do alvo concluídas conforme registro acima. O ensaio não corresponde ao replay integral da cadeia histórica de migrations.
- Após a ativação do Auth e a atualização do PostgreSQL, repetir os fluxos de login, cadastro, redefinição/alteração de senha e as verificações de saúde em ambiente apropriado.

## Referências

- [Segurança de senhas do Supabase Auth](https://supabase.com/docs/guides/auth/password-security)
- [Aviso da atualização PostgreSQL 17.11](https://supabase.com/changelog/postgres-15-19-17-11-breaking-changes)
