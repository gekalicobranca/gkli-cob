# Central dos workers de WhatsApp

Em **Configurações → Workers de WhatsApp**, administradores podem iniciar, pausar e reconectar cada sessão. O computador que mantém os perfis precisa estar ligado. Os comandos ficam no banco e são consumidos pelo supervisor local; a aplicação hospedada não tenta abrir processos no servidor web.

## Operação

Aplicar `20260923193000_whatsapp_worker_recovery.sql`, encerrar os workers avulsos preservando os perfis e executar na raiz:

```powershell
npm run supervisor --prefix scripts/whatsapp-web
```

Manter apenas um supervisor neste computador. Ele usa `.env.local` e os arquivos `.env.whatsapp-genske`, `.env.whatsapp-gekali` e `.env.whatsapp-azevedo`. Não executar os comandos individuais junto com o supervisor. O arquivo `.whatsapp-web/supervisor.lock` impede dois supervisores; sinais de processos anteriores também são conferidos antes de iniciar cada sessão. Os processos filhos encerram quando perdem a conexão IPC com o supervisor.

O supervisor mantém os workers de envio habilitados conforme os controles no banco. Uma falha provoca nova tentativa após 15, 30 e até 60 segundos. Cinco minutos de operação estável reiniciam a contagem. Falha ao consultar o banco não encerra o supervisor nem altera a escolha do operador. O encerramento do navegador tem prazo máximo; somente a árvore de processos daquele navegador é finalizada à força se necessário. Não apaga perfis ou faz logout. Autenticação expirada exige QR; número incorreto exige correção e comando de reconexão.

Para manter o supervisor ativo no Windows, executar `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/whatsapp-web/install-persistent.ps1`. A tarefa `GKLI-WhatsApp-Supervisor` inicia imediatamente e a cada login do usuário, com verificação a cada cinco minutos e sem instâncias sobrepostas. O executor oculto recupera o supervisor em 15 segundos se ele encerrar. Após reiniciar o computador é necessário entrar na conta do Windows; o computador deve permanecer ligado e sem suspensão. Não executar outro supervisor manual junto com essa tarefa.

Os logs do executor ficam em `.whatsapp-web/persistent*`; os dos workers em `.whatsapp-web/*supervisor*.log`. Para interromper permanentemente, desabilitar e encerrar a tarefa no Agendador e encerrar o supervisor; para pausar apenas os envios, usar os controles do painel. O painel de QR continua em `http://127.0.0.1:3877`.

Falhas de heartbeat no banco suspendem novas reservas sem destruir o navegador autenticado. Uma atualização bem-sucedida libera o processamento novamente. Timer e loop compartilham a mesma atualização em andamento. Falhas em reservas ou na gravação do resultado continuam encerrando o worker para reconciliação segura; mensagens incertas nunca são repetidas automaticamente.

## Mensagens incertas

O heartbeat verifica também a conexão real do navegador, a página e o estado CONNECTED do WhatsApp. Estados transitórios, timeout e perda de frame suspendem novas reservas, mas preservam o navegador por até dois minutos para permitir recuperação. O estado volta a conectado somente após uma consulta válida ao WhatsApp e conferência do número. Uma recuperação bem-sucedida reinicia essa janela. UNPAIRED/UNPAIRED_IDLE pedem autenticação, sem reinícios contínuos por causa desse estado. A biblioteca ainda pode encerrar o navegador em eventos explícitos de desconexão; nesse caso o supervisor restaura o mesmo perfil. Erros de navegador encontrados durante a entrega provocam reconexão após persistir o resultado. Falhas anteriores à transmissão continuam distintas de resultados incertos após o início do envio; estes últimos não são repetidos automaticamente.

A inicialização usa o user-agent do navegador instalado, sem a identificação Chrome 101 padrão da biblioteca. `resilient-client.mjs` adapta whatsapp-web.js 1.34.7: a primeira navegação aguarda DOMContentLoaded com prazo de 120 segundos, depois espera o contexto do WhatsApp com `waitForFunction`. Navegações que destroem o contexto permitem até duas novas tentativas de inicialização, sem repetir transmissões. Ao atualizar a biblioteca, revisar essa adaptação e seus testes. Os logs registram abertura, integração, autenticação, sincronização e mudanças de estado.

A migração `20260924190000_whatsapp_daily_limit_successful_attempts.sql` ajusta a cota diária de 50 por linha: falhas sem recibos não consomem a cota. Envios confirmados, reservas em andamento, resultados incertos e tentativas com recibos parciais continuam contando. A cadência de 60 segundos entre tentativas e a janela de 9h às 18h permanecem iguais. Aplicar essa migração no banco é necessário para mudar a regra em produção.

Uma tentativa sem recibo permanece registrada e não é repetida automaticamente. O worker encerra seu navegador para interromper eventuais chamadas pendentes; o supervisor reconecta e continua com outras mensagens. Uma reserva de processo encerrado é transformada em incerta antes do novo início. Reservas em andamento, limites de horário, cadência e limite diário continuam sendo respeitados.

A busca de recibo de texto consulta tanto o índice de busca quanto o histórico recente da conversa. Só recupera uma mensagem própria, com texto integral idêntico, ID novo, horário compatível e confirmação do servidor. Isso reduz falsos negativos de indexação; não garante que toda ausência de recibo seja recuperável.

Para **confirmar envio**, pause o worker, espere o comando ser aplicado, confira texto/anexos e registre o resultado. Para **reenviar sem confirmação**, use a opção específica, aceite a possível duplicidade de texto e anexos e informe a justificativa. O usuário e os recibos anteriores ficam no log de auditoria. Não é permitido reenviar reservas ainda em andamento, mensagens já confirmadas, ou mensagens de Flows pausados/cancelados. O comando de reenvio é individual e não habilita reenvios indiscriminados.

## Verificação

```powershell
node --test scripts/validate-whatsapp-web.mjs scripts/whatsapp-web/recovery.test.mjs scripts/whatsapp-web/browser-health.test.mjs scripts/whatsapp-web/worker.test.mjs scripts/whatsapp-web/receipt.test.mjs
npm run typecheck
```

Os testes cobrem continuidade após resultado incerto, exclusão de reservas concorrentes, autorização explícita de reenvio, auditoria, pausa, permissões, busca de recibos em duas fontes, espera progressiva e encerramento limitado.
