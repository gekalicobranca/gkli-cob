# Pausas de régua: escopo e disponibilidade

Correção preparada em 22/11/2026, na branch `codex/flows-pausa-escopo`, sobre a main `df9afb58`, em worktree isolada. O checkout operacional com remoções locais foi preservado.

## Decisão

Campos de contexto não podem ampliar uma pausa ao condomínio. Para comunicação, o escopo efetivo é o primeiro identificador preenchido: cobrança, unidade, acordo, condomínio. Uma pausa com unidade, acordo e condomínio bloqueia a unidade; o vínculo com o acordo permanece para a apuração de conciliação financeira. Uma pausa genuína de condomínio (sem identificadores mais específicos) continua abrangendo suas unidades.

`features/regua/services/pausa-escopo.ts` centraliza a resolução e a leitura paginada de pausas ativas, com término inclusivo. As consultas são feitas por escopo, em partes de 100 IDs, páginas de 500 registros e concorrência máxima de quatro partes. A carteira do contexto é validada ao aplicar cada pausa. Erros de consulta impedem prosseguir, sem liberar comunicação por ausência presumida de bloqueio.

`suspension.ts` usa a mesma regra no processamento de cobranças, acordos e Easy Flow. `features/flows/cobranca/queries.ts` retira cobranças pausadas antes de contatos, totais e paginação, tanto no painel quanto na disponibilidade, inclusive seleção de todas as páginas. `actions.ts` revalida pausas na ativação e antes da criação de lote, devolvendo erro tratável para seleção antiga. O processamento continua revalidando a pausa na geração efetiva de mensagens.

## Ajuste de dado executado no GKLI - COB

Em 22/11/2026 foi corrigida somente a pausa `e37abbe9-16e8-49d2-8868-bec953ebc8fc`, da unidade 000037, bloco 1, Suit São Bernardo. A alteração retirou `condominio_id`, preservando `unidade_id`, `acordo_id`, `ativo=true`, motivo, `pausa_ate=null` e `payload.conciliacao_pagamentos_pendente=true`. Foi registrado um evento em `auditoria_eventos`, com escopo anterior e posterior. A consulta posterior confirmou todos esses campos.

Esse ajuste impede que o código atualmente implantado (que usava OR entre os identificadores) estenda essa pausa a todo o condomínio. Não desativa a conciliação, não altera situação financeira e não cria ou envia mensagens. Reversão do ajuste de escopo, se necessária, pode recuperar o `condominio_id` anterior na auditoria, sem reconstruir a pausa ou seu payload.

## Validação e pendências

21 testes locais aprovados: escopo com unidade/acordo/condomínio, proteção de carteiras, pausas específicas e gerais, expiração, mais de 500 pausas, falha de consulta, disponibilidade nos dois canais, totais/paginação, seleção antiga, prazo e preservação financeira da conciliação. Comando:

`node node_modules/tsx/dist/cli.mjs --test scripts/validate-flow-pausas.ts scripts/validate-flow-prazo-regua.ts scripts/validate-flow-reativacao.ts scripts/validate-flow-condominio.ts scripts/validate-flow-performance.ts scripts/validate-acordos-conciliacao.ts`

A alteração do cadastro já foi aplicada e verificada. A publicação do código de disponibilidade/escopo não faz parte do ajuste live e permanece pendente até deploy autorizado. Nenhuma migration foi necessária.

TypeScript (`tsc --noEmit --pretty false --incremental false`), ESLint dos módulos alterados e `git diff --check` também aprovados.
