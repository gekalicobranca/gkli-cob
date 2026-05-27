# ADM1 — Central Operacional de Administradoras

## Entrega

Esta sprint transforma administradoras em ator operacional do acordo e da atualização de débito.

## Incluído

- Administradora obrigatória no cadastro do condomínio.
- Vínculo forte `condominios.administradora_id` com compatibilidade do campo legado `administradora`.
- Solicitações operacionais ADM rastreáveis.
- Código de rastreio no assunto/mensagem.
- Retorno manual estruturado, já preparado para Microsoft Graph no futuro.
- Régua ADM mensal para cobranças captadas em mês anterior.
- Lote ADM agrupado por administradora/condomínio.
- Bloqueio de formalização de acordo quando a planilha da competência atual não estiver registrada.
- Pedido de emissão de boletos a partir da tela do acordo.
- Status intermediário `aguardando_boletos`.
- Campos de preparação para e-mail automático futuro: `email_thread_id`, `email_message_id`, `provedor_email`, `origem_retorno`.

## Regra crítica

Cobranças com `created_at` anterior ao mês corrente precisam de `planilha_debitos_competencia = YYYY-MM` do mês corrente antes de formalizar acordo.

Enquanto a planilha não for atualizada:

- a criação/formalização do acordo é bloqueada;
- a operação deve gerar solicitação ADM;
- o retorno manual atualiza a competência da planilha e libera o fluxo.

## Fluxo manual atual

1. Operador gera solicitação ADM.
2. Sistema cria código de rastreio.
3. Operador copia/envia o e-mail manualmente.
4. Administradora responde fora do sistema.
5. Operador registra o retorno.
6. Sistema atualiza timeline, status e competência da planilha.

## Futuro Microsoft

A estrutura já aceita que o retorno seja capturado por Microsoft Graph, sem refatorar o modelo principal. A mudança futura será somente trocar a origem do evento de `manual` para `microsoft` e preencher `email_thread_id`/`email_message_id`.
