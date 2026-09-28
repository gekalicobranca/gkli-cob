# Continuação da régua pelo primeiro envio

Novos flows manuais e do Maestro começam pela primeira etapa ativa, independentemente da idade do débito. O prazo inicial do condomínio continua sendo um requisito de elegibilidade da cobrança.

A rotina `gkli-flow-progressao` consulta os envios confirmados a cada dois minutos. Somente `enviada` com `sent_at`/`enviada_em` inicia a contagem. D+7 e D+15 significam sete e quinze dias após o primeiro envio confirmado da sequência. Para WhatsApp, a primeira etapa D+1 inicia a sequência; D+5 e D+10 usam esse envio como marco, sem descontar o prazo inicial do condomínio.

Cada confirmação libera apenas a próxima etapa ativa. A rotina cria um flow de continuação com o template e os dados atuais e o ativa na agenda do canal. Uma data prevista é o primeiro instante permitido; janelas, limites e disponibilidade do canal podem adiar o envio. Falhas não liberam a próxima etapa.

Flows encerrados podem ter continuação pendente. Flows pausados impedem a continuação; cancelados cancelam sua fila. Antes de ativar, são conferidos novamente situação da cobrança, arquivamento, pagamento, bloqueios, acordo vigente, condomínio e régua. Etapas já preparadas ou enviadas não são recriadas, inclusive no histórico anterior à implantação. Envios históricos em uma etapa avançada não provocam reenvio de etapas anteriores.

`flow_progressao` mantém a data original, prazo, etapa, lote, lease e erros. A tela de flows mostra as próximas etapas e pendências. Falhas de preparação ficam em `atencao` para revisão; uma interrupção de execução retoma o mesmo lote e fingerprint. O encerramento do job e a ativação da agenda ocorrem na mesma transação.

Implantação: aplicar `20260929010000_flow_progressao_primeiro_envio.sql`, publicar a rota `/api/jobs/flows/progredir`, conferir `flow_progressao_enfileirar()` e então habilitar o cron. A migração deixa o cron desativado até essa conferência. O segredo permanece no Vault (`gkli_email_agenda_token`) e deve corresponder a `EMAIL_AGENDA_CRON_SECRET` da aplicação.

Validação: `node node_modules/tsx/dist/cli.mjs --test scripts/validate-flow-progressao.ts` cobre início, prazo, confirmação, deduplicação, consolidação, lease, retomada, pausa, acordo e cancelamento.
