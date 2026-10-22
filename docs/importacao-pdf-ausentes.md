# Ausentes na captação PDF

A confirmação de um PDF de cobranças remove os débitos ausentes da captação depois de processar todas as linhas, quando a substituição está habilitada (padrão). PDF não usa mais a limpeza antecipada das cobranças em Novo.

A função `conversao_remover_cobrancas_ausentes` revalida condomínio/carteira, bloqueia as linhas durante a operação e preserva vínculos em `acordos.cobranca_id` e `acordo_cobrancas`. Também preserva baixas/pagamentos, duplicidades com dependentes, processos/status judiciais, registros posteriores à conversão e o histórico fora do recorte operacional. Não infere pagamento.

Linhas incompletas, falhas de gravação, divergências ou relatórios explicitamente parciais impedem a limpeza. Uma conversão concluída ou já limpa não pode reaplicar um snapshot antigo. A opção explícita de não substituir continua preservada.

Mensagens já enviadas permanecem no histórico, mesmo quando a FK de cobrança usa CASCADE. Mensagens pendentes que incluam débitos removidos são canceladas, assim como continuações de cobrança. Flows pausados permanecem pausados. Não há montagem, aprovação, ativação ou envio de mensagens nesta operação. As exclusões e dependências ficam na auditoria, e as pendências de ausência são encerradas.

Verificação isolada, sem acesso a dados reais:

```powershell
npx tsx scripts/validate-conversao-pdf-ausentes.ts
npx tsx scripts/validate-conversao-pdf-confirmar.ts
```
