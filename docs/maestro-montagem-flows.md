# Montagem de flows após a importação do Maestro

Após confirmar uma conversão de execução `maestro`, `maestro_agendada` ou `agenda_mensal`, o endpoint de conclusão enfileira a conversão em `maestro_flow_montagens`. A chave única da conversão torna chamadas repetidas idempotentes.

O cron `gkli-maestro-flows`, a cada dois minutos, aciona `/api/jobs/flows/montar` com credencial protegida no Vault. Cada chamada processa uma parte; a lease dura quatro minutos e o endpoint tem duração máxima de três minutos. Montagens do mesmo condomínio não são executadas simultaneamente. Desligar a captação global pausa a montagem.

São avaliadas apenas as cobranças vinculadas à importação, dentro da carteira e condomínio da execução. A seleção respeita o prazo do condomínio, status, quitação, acordos e bloqueios; o motor existente mantém as demais verificações de suspensão e compliance. Usa-se uma régua ativa de e-mail da carteira. Sem essa régua, a montagem requer atenção. Falta de responsável ou e-mail válido é registrada em Saneamento.

As partes usam o mesmo divisor da criação manual, preservando a unidade. A meta é 20 cobranças por chamada; uma unidade com mais parcelas pode ocupar uma chamada de até 40 cobranças. Acima disso a montagem requer um filtro menor/revisão. A finalização impõe o teto de 20 mensagens após consolidação.

O lote é alocado junto com seu vínculo na fila, em uma transação. Ao retomar, o motor ignora itens já persistidos e recupera mensagens gravadas antes de uma interrupção. A finalização transacional cria o Flow, vincula mensagens e itens, salva a parte concluída e libera a próxima parte. Tokens vencidos não podem finalizar. Cinco interrupções consecutivas requerem revisão manual.

Os flows terminam em `pronto`, com mensagens `pendente_aprovacao`, sem reserva na agenda. A ativação ocorre somente pela ação manual, individual ou em lote, que continua usando as cotas e intervalos existentes. A montagem não envia e-mails.

O painel Montagem de flows pelo Maestro aparece no Maestro e em Flow cobrança. Exibe progresso, erros e motivos de exclusão. Retomar preserva o lote em andamento; Reavaliar pendências refaz a seleção, excluindo cobranças já vinculadas a flows, e mantém os flows anteriores.

Validação: `tsx --test scripts/validate-maestro-flows.ts scripts/validate-flow-divisao.ts` cobre elegibilidade, limites, lease, concorrência, recuperação do lote, finalização atômica e ausência de ativação automática.


## Disparo manual sob demanda

O botão Executar agora registra o pedido autenticado e abre `gkli-maestro://executar?id=...` neste computador. A instalação local é feita com `scripts/agente-automatico/instalar-executor-manual.ps1`, que registra somente o protocolo do usuário Windows, sem serviço ou tarefa agendada.

O executor recebe um ID específico, define `AGENTE_EXECUCAO_ID` e `AGENTE_RUN_ONCE=true` e inicia somente o coletor daquela receita. Os coletores nesse modo não criam agendas mensais e não consomem outros pedidos. Ao finalizar a importação de origem `maestro`, chamam o endpoint autenticado `montar-flow` até concluir a montagem ou registrar um bloqueio. A RPC `maestro_flow_claim_execucao` restringe a reivindicação à execução manual, preservando as mesmas leases e travas. A pausa da captação automática permanece; pedidos manuais explícitos podem ser processados sem ligar essa captação.

O monitor não encerra na importação: acompanha também a montagem. Os flows permanecem prontos para revisão, com mensagens pendentes de aprovação; esse clique não autoriza envio.

SELL: o login e o título do condomínio devem corresponder ao cadastro validado. Conforme regra operacional confirmada pelo usuário, o retorno autenticado de Cotas Pendentes ao início representa ausência de inadimplência. Nesse caso, salva-se evidência HTML local e registra-se sucesso sem criar cobranças, importações ou flows vazios. Login inválido, outro condomínio ou tela desconhecida não são tratados como resultado vazio. A exportação com inadimplência continua sujeita às validações do relatório e da conversão.

Testes: `node --test scripts/agente-automatico/manual.test.mjs` e `npx tsx scripts/validate-maestro-manual-api.ts` verificam isolamento dos pedidos, protocolo, limites de execução, autorização e montagem sem envio. O executor não é iniciado na instalação; a coleta real começa pelo clique do usuário.
