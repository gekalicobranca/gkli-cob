# Publicação — autorização e itens 1, 2 e 3

Publicado em 02/11/2026, via Git na branch `main`.

- Código funcional: `71beeceaad435c43c8826d152164e2ca069ebedf`.
- Preview validado: `dpl_4QqVJd7g1M8sQ1iZy7tUv2Fvscyg` (READY).
- Produção validada: `dpl_ogtWVds7K6QkaKCEF5ewTMf6ANtW` (READY), `https://gkli-cob.vercel.app`.
- Os itens 4 e 5 já publicados foram preservados.

## Migrações aplicadas

| Versão de produção | Nome |
|---|---|
| 20261102174734 | trusted_profile_authorization |
| 20261102174844 | auditoria_aprovacao_sindico |
| 20261102174848 | auditoria_pre_juridico_estados |

Os nomes dos arquivos foram alinhados às versões retornadas pelo Supabase, evitando reaplicação. O snapshot de backup foi regenerado.

## Verificações

- 23 testes de autorização/perfis, 31 testes dos itens 1–3 e regressões operacionais, 13 testes de regressão dos itens 4–5: aprovados.
- TypeScript e lint dos componentes relevantes: aprovados. Build de validação e build de produção: aprovados.
- A migração respeita a restrição financeira real: rejeitar cancela o status do acordo e parcelas sem gravar o inexistente status financeiro “cancelado”.
- Comparação de todos os campos originais antes/depois: perfis, acordos e parcelas idênticos. Nenhum pagamento ou valor foi reescrito.
- Hashes MD5 usados somente como evidência de igualdade: perfis `1a43a77dc2d62c1e39ab4d498872f4f2`; acordos (campos originais) `10d6b894ccc51bf035aa98f3d1b73e47`; parcelas `e53f2d82370ddbde5f5ec6468acdd608`.
- Duas novas tabelas de histórico com RLS habilitada e políticas de leitura por carteira.
- O linter do Supabase acrescentou um aviso esperado para a RPC SECURITY DEFINER `decidir_aprovacao_sindico`: execução autenticada é intencional, protegida por perfil admin/gestor, carteira, estado e bloqueio de pagamentos. Avisos anteriores permanecem sem alteração. Referência: https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable

Os testes de escrita foram executados em banco local sintético. Em produção foram realizadas migrações e verificações de leitura, sem criar acordos fictícios nem enviar mensagens. A homologação humana de uma operação real permanece uma verificação operacional, sem impedir a publicação concluída.
