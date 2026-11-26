# Maestro — seleção de recibos Lello e formatos históricos

## Problema e regra

O diagnóstico de 25/11/2026 encontrou quatro conversões Lello bloqueadas pelo identificador de recibos. Em Bosque Marajoara e Villa Natura, a versão arquivada de uma cobrança era selecionada junto com a ativa de mesmo principal, unidade, bloco e vencimento. Em Co.Next Liberdade e Safira havia candidata única, mas as observações registravam o recibo sem dois-pontos ou fora do início do texto.

`features/importacoes/maestro-recibos-lello.ts` agora exclui `arquivada_em` não nulo tanto no carregamento por carteira/condomínio quanto no resolver em memória. Não exclui nem altera os registros históricos. A consulta geral da conciliação continua verificando recibos arquivados que reaparecem: esta mudança trata somente a seleção inicial do recibo da planilha Lello.

O resolver reconhece marcadores explícitos `recibo <número>` e `Recibo: <número>` no texto, inclusive entre linhas ou após outro conteúdo. Na ausência de alias sintético compatível, a aceitação exige origem histórica de conciliação Lello (`Conciliação Lello ...`) ou de importação de cobranças (`importacao_cobrancas ...`), além da candidata única no escopo e principal idêntico. Continuam válidas as origens de espelhamento Lello com código exato e o vínculo anterior por alias.

Não se extrai um número avulso do texto. Dois números de recibo distintos, alias conflitante, duas candidatas ativas, origem sem reconhecimento ou principal incompatível mantêm o bloqueio. O recibo resolvido e a chave sintética original permanecem na linha para repetição idempotente; não se reutiliza o mesmo recibo em duas linhas da unidade.

## Limites

Não há alteração de RPC, schema, acordos, vínculos de acordo ou `parcelas_acordo`. O resolver apenas prepara a identidade da cobrança; os caminhos existentes de atualização e suas proteções financeiras permanecem responsáveis pela etapa seguinte. Não há retomada, importação ou atualização automática dos estados de falha por esta mudança de código.

## Validação local

Foram usados dados sintéticos para reproduzir as duas ambiguidades com histórico arquivado e os dois formatos históricos. Os testes percorrem também resolver → conciliação Maestro, conferindo retorno de atualização da cobrança existente, sem reinserção ou mutação dos objetos. Incluem repetição idempotente, conflito de recibos, alias incompatível, origem sem reconhecimento, principal diferente, duas candidatas ativas e filtro de carregamento por carteira/condomínio.

- `node --no-wasm-tier-up node_modules/tsx/dist/cli.mjs --test scripts/validate-maestro-recibos-lello.ts scripts/validate-conciliacao-recibos.ts`: 23 testes aprovados; o teste SQL usa PGlite em memória, sem conexão remota.
- `node --no-wasm-tier-up node_modules/tsx/dist/cli.mjs scripts/validate-conversao-pdf-confirmar.ts`: aprovado, com dependências simuladas, sem importar dados reais.
- `node node_modules/typescript/bin/tsc --noEmit --pretty false --incremental false`: aprovado, sem erros.
- `git diff --check`: aprovado.

Correção preparada em `work/maestro-lello-recibos-fix`, branch `codex/maestro-lello-recibos-legados`. A publicação deve conferir o commit servido pelo domínio de produção, sem executar a confirmação das conversões. A validação dos quatro padrões não garante ausência de outros bloqueios posteriores nos relatórios completos.
