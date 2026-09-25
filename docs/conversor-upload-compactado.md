# Envio de relatórios grandes

O conversor aceita arquivos de até 32 MiB e compacta automaticamente, no navegador, os que ultrapassam 4 MiB. O conteúdo original, nome e MIME são preservados. A compactação GZIP ocorre em worker via `fflate`, já instalado no projeto. O resultado fica em cache associado ao arquivo para a identificação automática e as trocas de condomínio.

O limite de transporte continua em 4 MiB, reservando espaço para o formulário dentro do limite da hospedagem. Arquivos que continuarem maiores após compactação recebem uma mensagem solicitando um relatório menor. PDFs e XLSX já compactados podem continuar acima desse limite.

A rota autenticada restaura os bytes antes de chamar o parser existente. A descompactação limita a saída a 32 MiB e rejeita conteúdo inválido ou codificação desconhecida. Nenhum bucket, migração ou variável de ambiente adicional é necessário.

Validação: `npx tsx scripts/validate-conversao-upload.ts`. Para comparar a conversão original com a compactada usando um relatório HTML/XLS real, acrescente o caminho do arquivo como argumento. O teste imprime apenas métricas, sem os dados dos responsáveis.
