# Prazo mínimo na disponibilidade e ativação de Flows

Correção preparada em 20/11/2026 a partir da `main` em `90dce976`, em worktree isolada para preservar as remoções e alterações do checkout operacional. Não implica publicação em produção.

## Regra

Somente disponibilizar cobranças cujo vencimento tenha atingido o D+ do condomínio, inclusive no dia limite. Usar o dia civil de `America/Sao_Paulo`, com a mesma precedência de `classificar_cobranca_regular`: `greatest(0, coalesce(dias_apos_vencimento_regua, inicio_cobranca_dias, 30))`. Zero é configuração válida. Vencimento inválido/ausente ou condomínio indisponível impedem seleção.

O helper `features/flows/cobranca/prazo-regua.ts` centraliza a regra. `queries.ts` aplica o filtro às cobranças novas e ativas antes de contatos, vínculos, contagem e paginação, incluindo a seleção de todas as páginas. `actions.ts` lê vencimento e configuração no servidor, revalida antes de ativar cobranças ou criar lotes e preserva a proteção do banco. Nenhuma migration ou alteração retroativa de dados faz parte desta correção.

## Recuperação na tela

`ativarCobrancasFiltradasFlowCobranca` devolve erros esperados como estado. `cobrancas-painel-workbench.tsx` usa `useActionState` e alerta acessível no formulário. Seleção fora do prazo é recusada antes de qualquer atualização. Recusa do trigger durante a gravação também retorna erro, com a quantidade de partes anteriores já ativadas; a ativação em partes não é uma transação global. O redirect de sucesso continua fora de `try/catch`. Autenticação e escopo de carteira são mantidos.

## Verificação local

- `scripts/validate-flow-prazo-regua.ts`: D+30/60/90, limite inclusivo, fallback/zero, datas inválidas, virada de dia, seleção antiga e recusa do trigger com partes anteriores.
- `scripts/validate-flow-performance.ts`: disponibilidade e totais/paginação excluem registros antes do prazo e sem vencimento.
- `scripts/validate-flow-reativacao.ts` e `validate-flow-condominio.ts`: escopo, responsável, bloqueios e vínculos preservados.
- `scripts/validate-flow-ativacao-ui.mjs`: formulário real em navegador local, com Server Action simulada; erro visível, tela e seleção preservadas, sem ativação real.

Pendente: publicação e conferência autenticada da versão implantada. Os testes locais não executam ativações nem envios em produção.

Resultado local: 12 testes de prazo/ativação/escopo aprovados; teste integrado de disponibilidade e paginação aprovado; teste de formulário no Edge headless aprovado; TypeScript (`tsc --noEmit --pretty false --incremental false`) aprovado. O teste de navegador usa retorno simulado de Server Action, não substitui a conferência autenticada após publicação.
