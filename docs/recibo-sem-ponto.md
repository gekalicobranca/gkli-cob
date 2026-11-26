# Identidade de recibo sem ponto

## Regra

Ponto (`.`) não integra a identidade do recibo. A aplicação remove pontos ao interpretar campos explícitos, referências e marcadores de recibo das observações. Preserva outros caracteres de identificadores, como hífen, barra e sublinhado, e continua recusando conflitos entre números distintos.

O confirmador de relatório normaliza o recibo usado para gravar a cobrança e para a conciliação. `observacoesComRecibo` normaliza somente o token de recibo, sem remover pontos do restante do histórico. O resolvedor Lello reconhece os formatos antigos com ponto e mantém suas verificações de candidata única, alias, origem e repetição idempotente.

## SQL e inventário transacional

A migração `20261126113332_normalizar_recibo_sem_ponto.sql` prepara a mesma normalização em `public.cobranca_recibo_identidade`. Na mesma transação, bloqueia escritas em cobranças e reconstrói o inventário interno `cobrancas_recibo_guard` agrupando as identidades normalizadas. Isso impede que `12345678` e `12345678.` continuem com chaves separadas ou causem inconsistência nos triggers ao atualizar/excluir registros antigos.

Se existirem duas cobranças legadas que passam a ter a mesma identidade, o inventário conserva a contagem das duas; não escolhe, mescla, exclui ou altera nenhuma delas. Novas cópias continuam bloqueadas. Os privilégios e os triggers existentes são preservados. A migração não atualiza `cobrancas`, acordos, vínculos ou parcelas; altera a função, seu inventário interno e reconstrói o índice de expressão dependente `easy_cap_identidade_recibo_idx`, quando existente. A dependência foi confirmada por consulta somente leitura ao catálogo de produção; não há colunas geradas dependentes.

Essa alteração exige publicar aplicação e função SQL de forma coordenada. Não basta publicar apenas a aplicação, pois a seleção e a trava de recibos também usam SQL. Não há migração de dados financeiros nem retomada automática de captação.

## Diagnóstico e validação

Consulta somente leitura em produção, em 26/11/2026, encontrou 335 identidades com ponto; todas tinham ponto final, nenhuma tinha ponto interno. Nenhum desses registros foi reescrito. Os três casos isolados no diagnóstico das captações de 24/25 estão incluídos nesse universo; não são 335 casos de falha daquelas captações.

Os testes usam dados sintéticos e PGlite em memória, sem conexão remota. Os 27 testes de identidade, conciliação, Lello e inventário passaram. Cobrem pontuação, marcadores, conflitos, idempotência, impedimento de duplicatas e igualdade das linhas de cobranças/acordos/parcelas antes e depois da migração. A simulação do confirmador passou com recibo pontuado de entrada e recibo normalizado encaminhado à conciliação.

Após incluir a reconstrução do índice, os quatro testes específicos passaram novamente, incluindo busca pelo índice com as chaves normalizadas. `tsc --noEmit --pretty false --incremental false` e `git diff --check` também passaram.

Implementação em `work/recibo-sem-ponto-fix`, branch `codex/recibo-sem-ponto`. A migração usa locks `NOWAIT` e timeout de locks de dois segundos: se houver conflito, deve abortar atomicamente e aguardar uma janela livre, sem cancelar trabalhos ativos. A publicação deve conferir a função, o inventário, o índice e o commit servido pelo domínio, sem retomar captações.

SQL aplicado no GKLI COB em 26/11/2026, versão remota `20261126113332`; o arquivo local foi alinhado à versão registrada pelo servidor. A consulta de verificação encontrou zero identidades com ponto, inventário sem divergências e índice válido. As assinaturas completas das 21.819 cobranças, 5.251 acordos, 8.955 parcelas de acordo, 8.843 vínculos e 14.357 parcelas de cobrança permaneceram iguais antes/depois. Não houve coleta ou confirmação de conversão nesta etapa.
