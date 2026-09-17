# Ativação automática do Maestro

O controle por carteira aparece na aba Maestro do Flow cobrança e na aba Flows do Maestro. Admin e gestor podem ligar ou pausar. Carteiras novas começam pausadas; a habilitação inicial das carteiras existentes é feita após a publicação.

Somente flows inseridos pelo Maestro enquanto o controle da carteira está ligado entram na fila de ativação. Não há preenchimento retroativo da fila. Flows antigos e manuais continuam exigindo ativação manual.

O cron existente, a cada dois minutos, processa uma ativação pendente e uma parte da montagem. A fila persiste no banco; o bloqueio transacional serializa a ativação com a agenda manual. A chamada à agenda e a conclusão da fila ocorrem na mesma transação. Repetições após perda da resposta não duplicam reservas.

Antes de ativar, confere condomínio, carteira, bloqueios, acordos (inclusive vínculos), status das cobranças, canal e destinatários. O Maestro monta e-mails; outros canais exigem conferência manual. A ativação chama email_ativar_flow, preservando limites e horários, sem enviar diretamente.

Falhas ficam em Requer atenção, com motivo e tentativa manual após correção. Pausar carteira ou captação global suspende ativações pendentes; não cancela envios já agendados. Retomar a carteira libera sua fila pendente. Flows montados durante a pausa continuam manuais.

Validação: scripts/validate-maestro-ativacao.ts (PGlite, sem disparos reais).
