# Easy Cob — operações de cobranças

Preparação de publicação em 18/11/2026, na branch existente `codex/parcelas-valor-pago`.

O card Cobranças oferece consulta, criação manual, edição financeira e exclusão operacional. Criação e edição reutilizam as actions do domínio, com autorização por papel e carteira no servidor. O formulário manual encadeia carteira, condomínio e unidade. Históricos de custos de protesto têm classificação própria.

A exclusão é arquivamento, sem DELETE: exige admin/gestor, carteira permitida, confirmação e motivo. A RPC bloqueia pagamentos, acordos, duplicidades, arquivos anteriores e vínculos com mensagens, lotes, progressão de flows ou conciliação. Mesmo comunicação histórica exige revisão operacional; o atalho não cancela mensagens. Os triggers existentes preservam valores, auditam o arquivamento e impedem alteração posterior.

## Banco e publicação

A migration `20261118210000_easy_excluir_cobranca.sql` depende do arquivamento operacional existente (`20261103194949`) e das tabelas operacionais referenciadas. Execução restrita a `service_role`; a action valida usuário e carteira antes da RPC. A migration não foi aplicada remotamente nesta preparação. Sua aplicação exige autorização explícita, conferência do projeto, pré-requisitos e histórico remoto. A Vercel não aplica migrations; sem a RPC a ação de exclusão falha sem arquivar o registro.

Publicação somente por PR para `main`, com quality e Vercel Preview aprovados. Este PR não autoriza aplicação SQL remota ou merge.

## Verificação local

`npx tsx --test scripts/validate-easy-excluir-cobranca.ts` valida a RPC em Postgres embarcado, incluindo recusa por carteira, pagamentos, vínculos e permissão, preservação de valores e auditoria. Não substitui validação de integração no Supabase do ambiente autorizado. O teste existente `scripts/validate-arquivo-operacional.ts` verifica proteção contra edição/exclusão do histórico.
