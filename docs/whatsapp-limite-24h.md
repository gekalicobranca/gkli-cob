# Limite de WhatsApp

O envio Web usa no máximo 20 mensagens por número em uma janela móvel de 24 horas. O número compartilha a cota entre carteiras e sessões. A cota não reinicia à meia-noite.

A reserva serializa operações pelo número antes de conferir o limite. Reservas, envios confirmados, incertos e tentativas com recibo parcial contam; falhas comprovadamente sem transmissão não contam. O tempo considerado é o mais recente entre início e conclusão, para manter confirmações tardias dentro da janela. A vaga volta quando esse registro completa 24 horas.

Permanecem o intervalo mínimo de 60 segundos e o horário de 9h às 18h de São Paulo. Flows pausados continuam sem envio. A migração altera apenas a regra da reserva e cria um índice para a contagem; não chama o worker nem muda mensagens ou flows.

A lista de montagem e a divisão em partes priorizam responsáveis de WhatsApp sem e-mail, antes da paginação. A reserva também aplica essa prioridade ao contato efetivamente escolhido pela régua e registrado no payload, inclusive na fila atrasada. Dentro da mesma prioridade, permanece a ordem de agendamento. Pessoas com e-mail continuam elegíveis; não há montagem, ativação ou envio causado pela migração.

Validação isolada, sem credenciais ou envio real:

```powershell
npx tsx scripts/validate-whatsapp-limite-24h.ts
```
