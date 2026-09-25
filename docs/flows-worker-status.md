# Semáforo dos workers nos Flows

Os cards de cobrança de e-mail e WhatsApp consultam `/api/flows/cobranca/workers` a cada 30 segundos. A consulta exige autenticação, respeita as carteiras permitidas e devolve apenas cor e descrição. Falha na consulta remove o último estado verde e mostra status não confirmado.

- Verde: sinal recente de operação.
- Amarelo: conexão sem envio, canal desabilitado, inicialização ou modo ainda não confirmado.
- Vermelho: falha, desconexão, número divergente ou ausência de sinal recente.

O indicador representa o worker atual, inclusive nos cards do histórico. Não garante a entrega de uma mensagem nem ignora pausas, horários, limites e bloqueios do Flow.

## Fontes

- WhatsApp Web: `whatsapp_web_sessoes`, número configurado na carteira e modo registrado pelo worker em `agente_workers`, chave `mensageria:web:<sessao>`. Validade de dois minutos, igual à reserva de mensagens. Reiniciar workers antigos para registrar o modo; sessão sem esse registro não fica verde.
- E-mail SMTP e WhatsApp Cloud: o dispatcher registra separadamente o resultado de cada canal em `agente_workers`, chaves `mensageria:email` e `mensageria:whatsapp`. Validade de três minutos. A primeira consulta bem-sucedida após publicar o dispatcher produz o sinal. Não chamar o dispatcher apenas para verificar status, pois ele pode enviar mensagens.
- Thunderbird: dispositivo ativo da carteira, modo automático, teste concluído e `visto_em`, atualizado pelo banco durante as consultas à fila. Validade de três minutos. Nenhum token do dispositivo é consultado ou exposto.

Usa tabelas existentes; não requer migração. Falha na gravação da telemetria não interrompe o dispatcher nem altera reservas. Não habilita envios automaticamente.

Validação: `npm run typecheck` e `npx tsx --test scripts/validate-worker-status.ts`.
