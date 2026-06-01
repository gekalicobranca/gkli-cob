# GKLI Cobrança — R2 Réguas

## Escopo entregue

A R2 adiciona a segunda camada do motor de réguas:

- Scheduler para execução automática via Vercel Cron.
- Jobs auditáveis por tipo de régua.
- Suspensão inteligente por cobrança, acordo, unidade ou condomínio.
- Compliance operacional com janela de horário, limite diário, intervalo mínimo e blacklist.
- Score operacional inicial de recuperação/risco/prioridade.
- Preparação para retornos automáticos futuros sem acoplar WhatsApp/e-mail agora.

## Endpoint de scheduler

`/api/regua/scheduler`

Parâmetros opcionais:

- `tipo=cobranca`
- `tipo=acordo`
- `dryRun=1`

Exemplos:

- `/api/regua/scheduler`
- `/api/regua/scheduler?tipo=cobranca`
- `/api/regua/scheduler?tipo=acordo`
- `/api/regua/scheduler?dryRun=1`

O endpoint usa o mesmo segredo dos endpoints cron existentes.

## Retornos manuais

Os retornos continuam manuais, mas agora podem gerar efeitos operacionais:

- promessa de pagamento: pausa sugerida/automática
- pedido de boleto: pausa curta
- negociação: pausa curta
- contestação: pausa mais longa
- jurídico: pausa longa

Tudo alimenta:

- timeline operacional
- logs de mensageria
- tabela `regua_pausas`
- tabela `regua_inteligencia_scores`

## Retornos automáticos futuros

Quando WhatsApp/e-mail/API entrarem, devem criar eventos com a mesma estrutura:

- origem: `webhook`, `whatsapp`, `email`, `sistema`
- tipo de retorno
- mensagem vinculada
- cobrança/acordo vinculado
- payload bruto do provedor em `retorno_automatico_payload`

Assim o analytics não depende do canal. O canal só vira uma origem adicional de evento.
