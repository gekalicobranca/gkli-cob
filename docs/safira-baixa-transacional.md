# Safira: homologação Lello e baixa transacional

Implementado em 18/10/2026, com coleta nova nos portais e validação no banco real.

## Resultado da homologação

- 19 unidades com acordos vigentes no GKLI-COB entraram na coleta.
- 18 unidades foram coletadas. Unidade 300073 não apresentou links de acordos no
  histórico Lello: exceção aberta, sem presumir pagamento ou inadimplência.
- 33 acordos externos foram encontrados, incluindo históricos cancelados.
- 5 vínculos passaram pela correspondência única do cronograma completo.
- 13 acordos apresentaram vínculo/cronograma divergente e 15 apresentaram situação
  externa que exige revisão. Nenhum valor ou vencimento foi corrigido automaticamente.
- Nos vínculos homologados havia 7 pagamentos já registrados e 1 recebimento novo.

Primeira baixa validada: unidade 200053, acordo externo 1378803, parcela 3,
R$ 288,34, vencimento 20/10/2026, recebido antecipadamente em 05/10/2026,
recibo externo 3249867 e parcela externa 3303858. O acordo interno é
`4ec1493c-a075-4185-9f68-3c9a905d4175`; a parcela é
`9c9e38d1-01d5-4cb4-9ae8-b0662eae444a`.

Verificação de produção: parcela paga na data real, acordo financeiro parcial,
um recibo persistido, um evento de auditoria, um evento de timeline e uma atividade
de confirmação no caso operacional da Keila. Reexecutar a rotina não criou baixa
adicional; repetir a RPC diretamente retornou `reutilizado=true`.

As datas antigas reconstruídas pela importação foram preservadas. Divergências
incluem centavos, primeiro vencimento, quantidade de parcelas e cronogramas diferentes;
essas diferenças precisam de conciliação própria antes de ampliar a autonomia.

## Critério de vínculo

A identificação exige unidade externa, total do acordo e o conjunto completo de
vencimentos/valores iguais. Deve existir exatamente um acordo interno e um externo
correspondentes. O banco revalida o cronograma ao homologar e antes de cada baixa.

Para cada recebimento, também são conferidos número, vencimento, valor original,
valor pago e status Contabilizado no recibo individual e no acordo completo. As
datas das cotas originais não são usadas como data de pagamento do acordo.

## Transação e limites

As RPCs `safira_homologar_lello` e `safira_baixar_lello` são SECURITY INVOKER,
restritas ao executor service_role. Anon e usuários autenticados do navegador não
podem executá-las nem acessar diretamente as tabelas privadas. O executor mantém
a credencial no ambiente local; ela não é enviada ao Dot em mensagens.

`lello_vinculos_safira` guarda o vínculo e o cronograma. `lello_recebimentos_safira`
guarda parcela, recibo externo, parcela externa, valor, data e evidência. Há restrições
únicas por parcela, recibo e parcela externa. As evidências HTML ficam em bucket
privado `lello-evidencias`, identificadas pelo SHA-256, sem sobrescrita pelo CLI.

A transação reserva acordo, vínculo, parcelas, unidade, casos e cobranças; revalida
escopo, cronograma, evidência com até 24 horas e bloqueios; depois grava parcela,
estado financeiro, eventual quitação, efeitos operacionais nas cobranças, auditoria,
timeline e atividades da Keila. Qualquer erro desfaz todas essas escritas.

Bloqueios humanos/judiciais, suspensões, acordos encerrados, divergências, pagamento
parcial e estorno ficam fora da baixa automática. A rotina não altera mensagens,
flows, suspensões ou respostas aprovadas. O endpoint manual de baixa continua separado.

O aviso do linter sobre RLS sem políticas nas duas tabelas é intencional: acesso
de cliente foi revogado, e apenas o executor privado opera nelas. Referência:
https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy.

## Operação do Dot no computador conectado

Executar na raiz do repositório, com `.env.local` já configurado. Para cada rodada,
usar pasta nova e executar os comandos sequencialmente:

```powershell
node --env-file=.env.local scripts/safira-conciliar.mjs coletar .codex-tmp/safira-AAAA-MM-DD-HHMM
node --env-file=.env.local scripts/safira-conciliar.mjs homologar .codex-tmp/safira-AAAA-MM-DD-HHMM
node --env-file=.env.local scripts/safira-conciliar.mjs registrar .codex-tmp/safira-AAAA-MM-DD-HHMM
node --env-file=.env.local scripts/safira-conciliar.mjs baixar .codex-tmp/safira-AAAA-MM-DD-HHMM
```

`coletar` só lê o banco e os portais e não reutiliza uma pasta de coletas anterior.
`homologar` gera o plano local. `registrar` persiste somente os vínculos aceitos.
`baixar` relê o banco, recalcula o plano e confirma apenas recebimentos novos válidos;
ao final, atualiza o resumo do caso operacional da Keila por controle de versão.

Os arquivos `falhas-coleta.json` e `homologacao.json` registram exceções. Uma falha
em uma unidade não autoriza presumir sucesso para ela. A evidência de uma unidade
só entra no plano se todos os seus links foram interpretados; arquivos parciais
nunca confirmam pagamento. Falha durante baixa exige consultar o ledger e repetir
o mesmo recibo, sem inventar chave nova nem trocar a data. O CLI mantém checkpoint
após cada RPC; a transação é por recebimento, não por lote inteiro.

Instrução para o Dot: executar esta rotina somente no Safira, preservar as exceções,
nunca corrigir cronogramas por aproximação e avisar quando houver nova baixa,
divergência nova ou intervenção necessária. Não há novo daemon, cron ou agendamento
ativado por esta entrega. Cádiz permanece fora desta função de baixa.

## Validação

```powershell
node --test scripts/validate-safira-baixa.mjs scripts/acordos-portais/safira-homologacao.test.mjs scripts/acordos-portais/lello-recebimentos.test.mjs
```

11 testes cobrem formato da Lello, correspondência única, bloqueios, recibo repetido,
repetição divergente, permissões, execução service_role e rollback por falha de
auditoria. Também foram verificados coleta real, homologação, primeira baixa,
notificação à Keila e repetição idempotente em produção.

Migrações aplicadas: `20261018232841_safira_lello_baixa_transacional.sql` e
`20261018233016_safira_lello_resumo_keila.sql`.
