# Validade de propostas da Keila e da Lidia

Novas propostas conferidas incluem validade de **7 dias após o envio confirmado**. Aprovar ou reservar um horário não inicia esse prazo. A mensagem enviada e sua aprovação permanecem imutáveis; a identificação da regra fica na conferência e no registro da mensagem.

O primeiro vencimento (à vista ou primeira parcela) deve ficar entre hoje e o dia 10 que encerra o período corrente de 11 a 10, no horário de Brasília. Exemplos: 18/10 → até 10/11; 08/11 → até 10/11; 11/11 → até 10/12. As parcelas seguintes mantêm a periodicidade mensal.

Se esse vencimento passar antes dos 7 dias, o prazo de validade continua registrado integralmente, mas é necessária uma nova proposta. Não prorrogar automaticamente, reutilizar saldo antigo ou reaproveitar a aprovação anterior. Em novo pedido recebido, preservar o histórico, obter relatório do mesmo dia, conferir cotas e regras, recalcular, escolher o primeiro vencimento no período corrente e solicitar nova aprovação na tela. Coletas antigas concluídas não substituem a consulta atual. Fonte incompatível, incompleta ou bloqueada exige revisão humana.

## Lembrete automático autorizado

O operador autorizou o envio automático, por e-mail, apenas do lembrete “sua proposta vence amanhã”. O job `gkli-agentes-propostas-validade` verifica diariamente à 00h05 de Brasília as novas propostas efetivamente enviadas. A mensagem entra na agenda normal da carteira, respeitando a janela de e-mail das 22h às 06h e seus limites. O transporte configurado continua necessário; Thunderbird depende de seu dispositivo ativo.

Há no máximo um lembrete por mensagem original. Uma fila que adiar o lembrete para outro dia cancela esse lembrete. Novas execuções não recriam mensagens enviadas, falhas, canceladas ou incertas. O lembrete referencia o caso e a mensagem original, sem duplicar boletos ou recalcular valores.

Antes de enfileirar e novamente antes de enviar por SMTP ou Thunderbird, conferir: mesma versão aprovada, envio confirmado, véspera correta, primeiro vencimento ainda vigente, contato válido, unidade sem bloqueio judicial, cotas ainda abertas e sem suspensão, ausência de aceite/acordo e de novo retorno registrado. Atendimento humano, caso encerrado, nova resposta ou mudança da proposta impede o lembrete. O monitor deve registrar novos retornos antes de preparar respostas; não há leitura do Outlook por esse job.

Propostas históricas sem a nova identificação não recebem lembretes retroativos nem têm seus textos alterados. Este recurso não ativa flows de cobrança, não envia propostas sem aprovação e não autoriza criar acordos automaticamente.

Validação: `scripts/validate-propostas-validade.ts` e `scripts/validate-keila-conferencia.ts`.

## Após o aceite

Ao registrar o aceite real, Keila e Lidia mantêm a criação do acordo no app como **acordo firmado**, com as verificações financeiras e de validade existentes. O operador confere os valores, parcelas e vencimentos e registra a evidência recebida. Uma alteração do caso durante essa conferência exige recarregar a tela.

Na mesma transação, o atendimento passa para **atuação humana**, preserva a proposta aceita e sua aprovação e recebe uma pendência vinculada ao acordo: **formalizar na administradora e obter termo e boletos**. Se essa pendência não puder ser registrada, a criação financeira também é revertida. Repetições não criam uma segunda pendência.

O operador define se realizará o cadastro no portal ou solicitará que a administradora o faça, confere termo, grade, boletos e registro bancário e submete a comunicação para aprovação. Este encaminhamento não cadastra nada na administradora nem envia mensagens ao condômino ou à administradora. O acordo só é efetivado pela rotina financeira após pagamento confirmado. O aviso destacado de formalização pendente desaparece quando a pendência correspondente for resolvida.

Validação do aceite e encaminhamento: `scripts/validate-aceite-formalizacao.ts`.

### Aviso interno autorizado na carteira GEKALI

Novos acordos firmados e encaminhados para atuação humana na carteira GEKALI geram um único e-mail automático para **Danielle.lima@gekali.com.br**, com **edi.neves@gekali.com.br** em cópia visível. O aviso contém condomínio, unidade, condições aceitas, evidência do aceite, tarefa de formalização e links do atendimento e do acordo. Não aplicar esses destinatários à carteira Genske/Lidia sem autorização específica.

O registro do aviso é criado na mesma transação do encaminhamento e entra na agenda normal da carteira, com a janela atual de envio das 22h às 06h (Brasília), limites e bloqueios existentes. GEKALI usa SMTP, que envia a mesma mensagem aos dois destinatários com cabeçalho Cc. O Thunderbird bloqueia mensagens com cópia para não omitir destinatários. Se o transporte for alterado, manter esses avisos pelo SMTP ou atualizar o suporte a cópias antes de liberá-los.

Uma chave única vincula aviso, caso e acordo; atualizações posteriores não recriam avisos enviados, cancelados, falhos ou incertos. Não gerar avisos retroativos de acordos anteriores. A tela informa se o aviso está na fila, foi enviado ou apresentou falha, consultando o transporte. Aviso interno não substitui a aprovação exigida para mensagens e documentos destinados ao condômino ou à administradora.

Validação de destinatários, isolamento de carteira e deduplicação: `scripts/validate-aceite-formalizacao.ts`. Validação de Cc no envelope e no conteúdo SMTP, com e sem anexos: `scripts/validate-email-controle.ts`.
