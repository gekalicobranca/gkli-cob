# Avisos internos de pedidos de boletos da Lidia

Autorização de 21/10/2026: quando a Lidia encaminhar um pedido de boletos para atuação humana, notificar automaticamente acordos.camila@genskeadvogados.com.br, com cópia para edi.neves@gekali.com.br. Não enviar ao morador nem à administradora.

O banco reconhece o encaminhamento por `estado=atendimento_humano` e título que identifique pedido de boleto, ou pelo campo explícito `encaminhamento_humano.motivo=pedido_boletos`. O monitor deve usar esse campo explícito nos próximos pedidos, preservar o identificador real do e-mail e registrar a pendência concreta em `proxima_acao`. A rotina não precisa chamar SMTP ou Outlook: a transação cria o aviso interno na fila existente.

Escopo: Oásis na carteira 06827218-e2b1-4267-ad8f-81a0ab222cad e Cádiz na carteira atual 36b6c087-56d2-4297-be63-6dcbe02a9f00. Outros condomínios, Keila e pares de carteira divergentes não participam.

O aviso inclui resumo, pendência e link do atendimento. É imediato, sujeito às cotas e às proteções de tentativa incerta do provedor existente. Cada e-mail recebido tem chave determinística por caso; editar, reabrir ou repetir o encaminhamento não gera outra mensagem. Um retorno novo pode gerar aviso próprio. O histórico `avisos_boletos` registra o vínculo com a mensagem; o status real de entrega fica na mensageria. Falhas de reserva abortam a transação em vez de perder silenciosamente o aviso.

Não há varredura retroativa: o aviso da Katia já enviado pelo Outlook não é reenviado. Acordos, valores, cobranças e mensagens ao morador não são alterados.

Validação: `scripts/validate-lidia-aviso-boletos.ts` e regressão `scripts/validate-avisos-internos-imediatos.ts`.
