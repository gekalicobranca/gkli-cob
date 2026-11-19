# Importação de recibos com marcadores AE e J

Decisão implementada em 19/11/2026, no código local. Publicação e reprocessamento em produção não executados nesta etapa.

Na importação de cobranças e na confirmação manual de conversões, `Recibo AE N`, `Recibo J N` e `Recibo N` identificam a mesma cobrança, inclusive nas trocas AE/J em ambos os sentidos. AE e J são marcadores da administradora e não têm significado de estado no app. A conciliação exige correspondência única, mesma carteira, condomínio, unidade, vencimento e principal; competências preenchidas nos dois lados devem coincidir. Competência ausente na origem não apaga a cadastrada. Outros marcadores mantêm as regras anteriores. O Maestro conserva a conciliação transacional existente.

O registro existente recebe valor atualizado, juros, multa e correção explicitamente informados e competência quando antes ausente. O marcador cadastrado nas observações é conservado; se ausente, recebe o da origem. Não há precedência judicial para J. Observações históricas são conservadas. Valores ausentes não são convertidos em zero. Principal divergente, vencimento divergente, duplicidades e cobranças quitadas, pagas, canceladas ou baixadas continuam sujeitos a revisão.

A atualização não altera status legado, operacional ou financeiro, situação judicial, bloqueios de automação, identificação ou vínculos com acordos. A presença ou troca desses marcadores não judicializa nem desjudicializa a cobrança. Não modifica `acordos`, `acordo_cobrancas` nem `parcelas_acordo`; valores contratados permanecem como fotografia da negociação. Não associa a cobrança a um novo Flow. Repetir os mesmos dados não gera nova gravação.

Implementação: `features/importacoes/cobrancas-conciliacao.ts`, `identidade-recibo.ts`, `atualizar-recibo-marcador.ts`, `actions.ts` e `app/api/conversao-relatorio/confirmar/route.ts`. A gravação verifica `updated_at` e escopo novamente e registra origem e antes/depois pelo serviço operacional de auditoria existente. Como nesse serviço, atualização e registro do evento são chamadas separadas; falha de auditoria é propagada como erro da linha, sem desfazer a atualização já realizada.

Validação de regressão: `node node_modules/tsx/dist/cli.mjs --test scripts/validate-importacao-recibo-ae.ts scripts/validate-conciliacao-recibos.ts`. Inclui recibo renegociado, preservação de histórico e estado, idempotência, saldo/encargos, marcadores incompatíveis, duplicidades e concorrência. Dados de teste sintéticos. `validate-importacao-ano-corrente.ts` também passou. O teste anterior `validate-conversao-pdf-confirmar.ts` falha com “Não foi possível conferir a substituição”, tanto com a rota de HEAD quanto com a alteração; falha preexistente, fora deste escopo.

Resultados da ampliação AE/J: 19 testes aprovados em `validate-importacao-recibo-ae.ts`, `validate-conciliacao-recibos.ts` e `validate-importacao-ano-corrente.ts`; `npm run typecheck`, lint dos módulos de conciliação/identidade/atualização e `git diff --check` aprovados. Inclui matriz de trocas AE/J/ausente para cobranças judicializadas, em acordo e ativas, com verificação de estados, histórico, auditoria e idempotência.

Preparação de publicação em 19/11/2026: alterações preservadas em commit e `main` (`c36d4e93`) integrada por merge na mesma branch `codex/importacao-recibo-ae`. O diff final contém apenas os oito arquivos desta tarefa, sem migrations ou ajustes históricos de outras tarefas. Após a integração, 20 testes passaram, incluindo a regressão Lello presente na main; lint dirigido e `git diff --check` passaram. O teste de confirmação PDF falha por helper `observacoesComMarcador` ausente no mock da suíte; a mesma falha foi reproduzida lendo a rota diretamente de `origin/main`, sem alterar o checkout.

Publicação pelo GitHub: aguardar `quality` e Vercel Preview aprovados antes do merge; confirmar Production READY para o commit resultante. Se a pausa da equipe Vercel por limite Hobby persistir, manter o PR aberto sem contornar o check. Nenhuma alteração SQL remota é necessária.

Pendente: concluir a publicação e reprocessar a importação desejada em operação separada autorizada; resultados históricos de importação não são reescritos automaticamente. Publicar código não executa importações, não altera cobranças existentes e não envia mensagens.

## Atualização do saldo em 19/11/2026

A, AE, J e ausência de marcador são compatíveis. Com o mesmo recibo, principal e vencimento no mesmo escopo, a mudança de saldo atualiza a cobrança existente. A competência cadastrada, os estados e os acordos são preservados. Essa atualização não conta como divergência para a limpeza do lote.
