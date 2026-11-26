# Recuperação segura dos e-mails de Flows

26/11/2026. O dispatcher SMTP de Flows de cobrança e acordos passa a recuperar falhas transitórias comprovadamente seguras, na mesma mensagem. Não cria mensagem, lote ou Flow novos.

O transporte classifica o resultado antes de liberar qualquer recuperação:

- Erro transitório de rede antes de transmitir o corpo: repetir.
- Recusa SMTP explícita 4xx: repetir, pois comprova não aceitação.
- Recusa 5xx ou erro de configuração/conteúdo: revisão manual, sem repetição automática.
- Corpo possivelmente transmitido sem resposta de aceite: conferência, sem repetição.
- Reserva `em_envio` com mais de dez minutos: conferência. O estado histórico é preservado; a classificação é acrescentada.

Até três novas tentativas, após 5, 15 e 60 minutos, contando o total real de tentativas (máximo quatro). A agenda existente continua impondo janela 22h–06h, conta/rota SMTP, cota e cadência. Falhas na reserva, limite esgotado, mudança de elegibilidade ou configuração não são contornados. Flows pausados, cancelados ou ainda prontos não são retomados; um Flow anteriormente iniciado e encerrado com falhas pode continuar a execução autorizada.

A RPC de recuperação usa a mesma trava transacional da reserva/finalização e guarda a tentativa já processada. Repetir a chamada não repete o reagendamento. A atualização posterior do dispatcher não sobrescreve um resultado já registrado atomicamente. Uma tentativa incerta anterior, envio confirmado ou reserva Thunderbird bloqueia recuperação. A classificação de conferência bloqueia também novas reservas de agenda por trigger. Nenhuma RPC de recuperação é acessível a `anon` ou `authenticated`.

Histórico de tentativas, mensagens e vínculos permanece. Classificação, transmissão, erro e processamento são acrescentados a `email_tentativas`; decisões de recuperação são auditadas com antes/depois. Cancelamentos não são revertidos e tentativas sem mensagem não recriam vínculos. O monitor e os detalhes de cobrança/acordos mostram conferência para os resultados incertos e `em_envio` abandonados.

Legado: apenas o erro literal de timeout **na conexão** é prova suficiente para recuperação automática. Quedas de conexão e timeout aguardando resposta antigos não registram a fase SMTP; são separados para conferência, sem presumir que não houve envio.

Migração: `20261126160000_email_recuperacao_segura.sql`. Publicar a aplicação somente após aplicar a migração. A recuperação é chamada pelo dispatcher antes/depois da execução normal, e só agenda/classifica; o despacho continua submetido ao cron/janela existentes. Não alterar cron nem executar o dispatcher manualmente como parte da publicação.

Validação: quinze testes passaram, incluindo Postgres em memória com a migration real, idempotência, elegibilidade, pausa/cancelamento, limite, conferência, órfãos e permissões. TypeScript passou. ESLint sem erros, com dois avisos preexistentes em `features/flows/acordos/queries.ts`. Não foi simulada uma corrida entre conexões Postgres reais nem feita verificação visual autenticada.

Conferência somente leitura antes da publicação: 13 tentativas SMTP antigas em `em_envio`, sendo 3 mensagens agendadas (Inspire, Garden Club Barra Funda e Palácio das Águas), 7 canceladas e 3 sem mensagem vinculada. Nenhuma tinha tentativa posterior confirmada. Resultado da operação em produção e deploy serão registrados após conclusão.
