# Avisos internos de pedidos de boletos da Keila

Autorização de 21/10/2026: ao encaminhar um pedido de boletos para atuação humana, a Keila avisa automaticamente danielle.lima@gekali.com.br com cópia para edi.neves@gekali.com.br. Não envia nada ao morador ou à administradora.

A regra vale para casos keila_atendimento da carteira GEKALI e confere o vínculo do condomínio à mesma carteira. O monitor continua restrito ao seu piloto Safira. O encaminhamento deve ter estado atendimento_humano, e-mails com identificadores reais e título de pedido de boletos ou encaminhamento_humano.motivo=pedido_boletos. Use os serviços existentes de casos para registrar o encaminhamento; não insira mensagens diretamente nem chame SMTP/Outlook pelo monitor.

O banco registra o vínculo em avisos_boletos e no histórico, cria uma única mensagem por caso/retorno e usa a fila interna imediata existente. O status real de envio fica na mensageria. Edição ou reabertura do mesmo retorno não repete o aviso; novo retorno pode gerar aviso próprio. Cotas diárias e proteção de tentativas incertas permanecem. Não há disparo retroativo de casos existentes.

O aviso contém resumo, pendência e link do atendimento. Não cria acordo, não altera valores ou cobranças e não libera respostas ao morador.

Validação: scripts/validate-keila-aviso-boletos.ts, com a mesma migração de base da Lidia e verificação de destinatários, autorização diurna e deduplicação.
