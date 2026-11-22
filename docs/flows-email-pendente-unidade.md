# Disponibilidade por unidade e régua com e-mail pendente

Correção de 22/11/2026, preparada em worktree isolada sobre `3b51f68d`, para manter a proteção de duplicidade já existente em `validarCriacaoPorCanal` também na disponibilidade.

## Regra

Para a mesma carteira, unidade e régua, e-mail em `pendente_aprovacao`, `aprovada` ou `agendada`, vinculado a Flow de cobrança diferente de `cancelado`, impede oferecer essa régua a outras cotas da unidade. O filtro replica exatamente a verificação de criação; inclui Flow pronto ou pausado e usa a unidade da cobrança vinculada à mensagem. Não exige que a nova cota seja a mesma da mensagem anterior.

O impedimento é por régua. Outra régua elegível pode continuar disponível. Uma régua mista contendo e-mail também é impedida, mas uma régua de WhatsApp puro continua disponível. Mensagem enviada, falha ou cancelada não cria esse impedimento de unidade; os bloqueios próprios por cobrança/canal continuam existindo independentemente.

`email-pendente-unidade.ts` lê mensagens por carteira e unidades em partes de 80 IDs, páginas de 500 mensagens e até quatro consultas concorrentes. Não lê destinatários, conteúdo ou credenciais. Erros não são tratados como ausência de pendência.

`queries.ts` adiciona os IDs das réguas impedidas a cada cota antes de calcular réguas disponíveis, totais e páginas. `canais.ts` aplica essa informação, compartilhada também pelo agrupamento e seleção no workbench. Assim, a seleção de todas as páginas não recoloca cotas em uma régua impedida. O painel de novas cobranças aplica o mesmo critério.

A criação mantém a revalidação original no servidor, inclusive para seleção antiga ou pendência surgida após abrir a tela. Os estados pendentes são compartilhados entre consulta de disponibilidade e validação de criação. Nenhuma mensagem ou Flow existente é alterado, cancelado ou reenviado por esta correção. O filtro de pausas e a conciliação financeira permanecem ativos. Não há migration ou ajuste de dados.

## Validação

`validate-flow-email-pendente-unidade.ts`: outra cota da unidade nos três estados pendentes, réguas distintas/mistas/globais, WhatsApp puro, carteira/unidade diferente, Flow cancelado, mensagens encerradas, seleção por condomínio, mais de 500 mensagens e falha de consulta.

`validate-flow-performance.ts`: bloqueio fora da primeira página antes de totais, comparação entre seleção completa e páginas, e exclusão no painel de novas cobranças. As regressões de canais, pausas e conciliação também são executadas.

Publicação solicitada pelo usuário; acompanhar PR, quality, Preview e deployment de produção para confirmar a versão implantada. O checkout operacional com remoções locais foi preservado.
