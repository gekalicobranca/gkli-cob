# Consolidação do código — 29/10/2026

Integração sobre a main publicada, sem substituir arquivos por cópias locais antigas. Antes da limpeza foi criado um arquivo local externo ao repositório com snapshot, diff e manifesto SHA-256. Os originais de uso pontual permanecem recuperáveis nesse arquivo; não foram enviados ao Git.

## Alterações recuperadas

- Bloqueio de garantidora por data completa de vencimento, com limites inclusivos nos formulários e relatórios.
- Identificação do número de acordo HFlex e bloqueio da automação correspondente. A classificação judicial continua precedendo a indicação de negociação.
- Resolução transacional de unidades na importação e no cadastro de responsáveis usando RPC já existente. Preserva identidade, contatos e vínculos e rejeita ambiguidades.
- Consulta de unidades possivelmente duplicadas, apenas para análise; não funde ou exclui cadastros automaticamente.
- Cópias arquivadas continuam no histórico da unidade e deixam de duplicar os totais.
- Totais de relatórios usam a regra existente de exclusão do nominal substituído/duplicado, preservando valores históricos e recebimentos.
- Coletores com limite de chamadas, timeout, recuperação gradual e polling adaptativo; sinal recente de operação aceita até cinco minutos. A atualização não instala nem reinicia serviços locais.

## Proteções preservadas

Conciliação pendente impede apuração prematura de atraso/quebra/quitação. Mantidos filtros de condução judicial, advogado externo, unidade titular, agrupamento de acordos, contatos rápidos, consultas por período e custo por boleto. Credenciais/sessões locais permanecem ignoradas pelo Git.

## Arquivo local

Scripts de uso pontual para administradoras, conciliação financeira, simulações de mercado e versões antigas foram separados do código que será publicado. Não executar em lote os scripts ou SQL arquivados. Nenhuma migração foi aplicada durante esta consolidação. As cópias SQL em scripts/fixtures/contratos-existentes servem exclusivamente aos bancos isolados dos testes.

## Validação

100 verificações aprovadas: garantidora, identidade/RLS/contatos, duplicadas, HFlex, boletos/Price, exportações, importação de anos anteriores, telefones, transporte dos coletores, cadência e WhatsApp. Testes antigos de exportação e simulação foram alinhados aos contratos atuais sem remover verificações de valores e pagamentos. TypeScript e sintaxe/imports relativos de 14 arquivos JavaScript verificados.
