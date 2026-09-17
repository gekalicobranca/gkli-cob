# Montagem de flows após a importação do Maestro

Após confirmar uma conversão de execução `maestro`, `maestro_agendada` ou `agenda_mensal`, o endpoint de conclusão enfileira a conversão em `maestro_flow_montagens`. A chave única da conversão torna chamadas repetidas idempotentes.

O cron `gkli-maestro-flows`, a cada dois minutos, aciona `/api/jobs/flows/montar` com credencial protegida no Vault. Cada chamada processa uma parte; a lease dura quatro minutos e o endpoint tem duração máxima de três minutos. Montagens do mesmo condomínio não são executadas simultaneamente. Desligar a captação global pausa a montagem.

São avaliadas apenas as cobranças vinculadas à importação, dentro da carteira e condomínio da execução. A seleção respeita o prazo do condomínio, status, quitação, acordos e bloqueios; o motor existente mantém as demais verificações de suspensão e compliance. Usa-se uma régua ativa de e-mail da carteira. Sem essa régua, a montagem requer atenção. Falta de responsável ou e-mail válido é registrada em Saneamento.

As partes usam o mesmo divisor da criação manual, preservando a unidade. A meta é 20 cobranças por chamada; uma unidade com mais parcelas pode ocupar uma chamada de até 40 cobranças. Acima disso a montagem requer um filtro menor/revisão. A finalização impõe o teto de 20 mensagens após consolidação.

O lote é alocado junto com seu vínculo na fila, em uma transação. Ao retomar, o motor ignora itens já persistidos e recupera mensagens gravadas antes de uma interrupção. A finalização transacional cria o Flow, vincula mensagens e itens, salva a parte concluída e libera a próxima parte. Tokens vencidos não podem finalizar. Cinco interrupções consecutivas requerem revisão manual.

Os flows terminam em `pronto`, com mensagens `pendente_aprovacao`, sem reserva na agenda. A ativação ocorre somente pela ação manual, individual ou em lote, que continua usando as cotas e intervalos existentes. A montagem não envia e-mails.

O painel Montagem de flows pelo Maestro aparece no Maestro e em Flow cobrança. Exibe progresso, erros e motivos de exclusão. Retomar preserva o lote em andamento; Reavaliar pendências refaz a seleção, excluindo cobranças já vinculadas a flows, e mantém os flows anteriores.

Validação: `tsx --test scripts/validate-maestro-flows.ts scripts/validate-flow-divisao.ts` cobre elegibilidade, limites, lease, concorrência, recuperação do lote, finalização atômica e ausência de ativação automática.
