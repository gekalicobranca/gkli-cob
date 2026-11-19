# Easy Cob — operações de cobranças

Preparação de publicação em 18/11/2026, na branch existente `codex/parcelas-valor-pago`.

O card Cobranças oferece consulta, criação manual, edição financeira e exclusão operacional. Criação e edição reutilizam as actions do domínio, com autorização por papel e carteira no servidor. O formulário manual encadeia carteira, condomínio e unidade. Históricos de custos de protesto têm classificação própria.

A exclusão é arquivamento, sem DELETE: exige admin/gestor, carteira permitida, confirmação e motivo. A RPC bloqueia pagamentos, acordos, duplicidades, arquivos anteriores e vínculos com mensagens, lotes, progressão de flows ou conciliação. Mesmo comunicação histórica exige revisão operacional; o atalho não cancela mensagens. Os triggers existentes preservam valores, auditam o arquivamento e impedem alteração posterior.

## Banco e publicação

A migration `20261118210959_easy_excluir_cobranca.sql` depende do arquivamento operacional existente (`20261103194949`) e das tabelas operacionais referenciadas. Execução restrita a `service_role`; a action valida usuário e carteira antes da RPC. Aplicada com autorização explícita em 18/11/2026 no projeto `GKLI - COB` (`vjcmotflmcczoepflhwc`), após conferir histórico, colunas e triggers remotos. O nome do arquivo foi alinhado à versão gerada pelo Supabase. Confirmados registro, corpo da função, `security invoker`, `search_path` vazio e bloqueio de execução por anon/authenticated. O advisor de segurança manteve as mesmas contagens anteriores, sem ocorrência para a nova RPC. Nenhum registro operacional foi arquivado para teste. A Vercel não aplica migrations.

Publicação pelo PR #39 para `main`, com quality e Vercel Preview aprovados no commit final. O usuário autorizou a aplicação remota e o merge condicionado à verificação. Após merge, confirmar Production READY e o domínio ligado ao commit de main; não realizar deploy manual.

## Verificação local

`npx tsx --test scripts/validate-easy-excluir-cobranca.ts` valida a RPC em Postgres embarcado, incluindo recusa por carteira, pagamentos, vínculos e permissão, preservação de valores e auditoria. Não substitui validação de integração no Supabase do ambiente autorizado. O teste existente `scripts/validate-arquivo-operacional.ts` verifica proteção contra edição/exclusão do histórico.
