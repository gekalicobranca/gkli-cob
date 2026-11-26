# Mensagens sem confirmação nos Flows de cobrança

Alteração de 25/11/2026: a fila operacional no detalhamento do Flow separa mensagens com resultado incerto em **Conferência de envio**. A classificação considera o estado do provider e a última tentativa SMTP/WhatsApp Web, além da fila Thunderbird. Um envio confirmado deixa de ser tratado como incerto.

A seção de conferência não oferece reenvio. Cada cobrança de uma mensagem consolidada mantém sua linha; o contador da seção conta mensagens distintas. Mensagens, tentativas, itens e vínculos com o Flow permanecem intactos. Não há migration, alteração de status, ativação, despacho ou progressão automática. Os contadores agregados do Flow continuam representando os registros persistidos, incluindo as pendências de conferência.

Implementação: `features/flows/cobranca/conferencia-envio.ts`, consulta autorizada de itens em `queries.ts` e `components/flows/cobranca/flow-cobranca-workbench.tsx`. As tentativas são consultadas apenas após validar o escopo de carteira do Flow. Erro de consulta mantém a fila em erro com opção de tentar novamente, sem apresentar itens incertos como reenviáveis.

Validação: três testes em `scripts/validate-flow-conferencia.ts` passaram, cobrindo os três transportes, cancelamento, confirmação posterior e falha definitiva. `npm run typecheck`, ESLint dos arquivos alterados e `git diff --check` passaram. Consulta somente leitura em produção confirmou as três relações por mensagem e duas tentativas SMTP incertas vinculadas a Flows; nenhum registro foi alterado. Publicação e verificação visual autenticada ainda pendentes.
