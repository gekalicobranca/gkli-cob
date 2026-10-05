# Piloto WhatsApp Cloud API — GKLI

Ativado em 29/09/2026 para teste controlado com o número do responsável.

## Configuração

- Aplicativo: GKLI Integração Mensagens (`1580612700476593`).
- WABA: `28894207486936656`.
- Linha: +55 11 92111-8973; Phone Number ID `1389253710929744`.
- Callback: `https://gkli-cob.vercel.app/api/webhooks/whatsapp`.
- Inscrição do aplicativo: `whatsapp_business_account`, campo `messages` ativo. A consulta da Meta retornou versão `v26.0` para esse campo.
- Aplicativo inscrito na WABA, confirmado por consulta à API.
- Vercel: deployment `Ap3GE6ZqRtbycf6EKAWEXwuPfgE4`, republicação da versão de produção `0e83691` para aplicar as variáveis do webhook.

## Validação realizada

- Envio direto pela API recebido pelo responsável.
- Desafio GET do webhook retornou HTTP 200 e o conteúdo esperado.
- Nova mensagem de teste gerou eventos reais `status.sent` e `status.delivered` na tabela `whatsapp_webhook_events`, processados sem erro.
- POST sem assinatura retornou HTTP 401.
- `npx tsx scripts/validate-whatsapp-cloud.ts` passou.

## Escopo e pendências

As variáveis de produção alteradas nesta ativação foram `WHATSAPP_APP_SECRET` e `WHATSAPP_WEBHOOK_VERIFY_TOKEN`. As credenciais do envio de teste permanecem em `.env.whatsapp-cloud-pilot`, ignorado pelo Git. Não copiar valores secretos para este documento.

As carteiras e remetentes existentes não foram modificados. GEKALI, Azevedo Araújo e Genske Advogados usam Web; Valente Gomes já estava marcada como Cloud. Não executar o dispatcher geral para testar: ele pode selecionar cobranças reais. O token global de envio de produção não foi substituído pelo token do piloto.

Na ativação inicial, a resposta `PILOTO OK` ainda não havia sido registrada em `whatsapp_inbound_messages`. A mensagem de teste foi enviada diretamente e seus status ficam no log de eventos, sem vínculo a uma cobrança. A carteira e o recorte foram definidos na etapa abaixo.

## Carteira escolhida e preparação dos flows

O gestor escolheu **Escritório Genske Adv** (`36b6c087-56d2-4297-be63-6dcbe02a9f00`) e autorizou corrigir os vínculos dos quatro condomínios, bem como repetir cobranças anteriormente enviadas. Essa carteira aparece com o nome antigo Valente Gomes em registros históricos.

Os condomínios já estavam na nova carteira, mas suas 172 cobranças ainda apontavam para Genske Advogados. Foram corrigidos os vínculos operacionais das cobranças, unidades, responsáveis, acordos e históricos relacionados. Os registros foram preservados; cópias anteriores e registros da operação estão em `output/whatsapp-piloto/genske-transfer-*.json`. Registros de fechamento/faturamento e auditorias históricas não foram reescritos.

A régua exclusiva `d921afc8-0562-4a34-8d02-f50db4224f16` contém as três etapas da régua WhatsApp existente da Genske, com cópias próprias dos textos. Os novos flows são preparados pausados, com mensagens pendentes de aprovação e sem agendamento. Quatro flows anteriores de WhatsApp que estavam prontos/em execução foram pausados para evitar envios concorrentes.

O recorte contém 57 cobranças canônicas em `em_cobranca_ativa`: 14 no Verdana Residencial, 18 no Verdana Suítes, 10 no Residencial das Ilhas e 15 no Residencial Morumbi. Cobranças em acordo, negociação, pré-distribuição, judicializadas ou suspensas não integram esse recorte.

A carteira foi configurada com transporte Cloud e remetente próprio da linha GKLI; `whatsapp_habilitado` continua falso. A consulta à WABA retornou zero templates oficiais. Antes de ativar, é necessário ter templates aprovados e mapeados nas etapas, verificar as condições de envio iniciadas pela empresa e atualizar/validar o token de envio em produção. As credenciais do teste direto não substituíram o token global de produção.

Validação final no banco: quatro flows pausados, 57 cobranças distintas vinculadas aos itens, 14 mensagens pendentes de aprovação e nenhum agendamento. Outras 43 cobranças ficaram com o motivo “Responsável sem destinatário para o canal selecionado”, mesmo após a busca de responsáveis de apoio.

| Condomínio | Cobranças | Mensagens preparadas | Sem telefone utilizável |
| --- | ---: | ---: | ---: |
| Verdana Residencial | 14 | 1 | 13 |
| Verdana Suítes | 18 | 12 | 6 |
| Residencial das Ilhas | 10 | 1 | 9 |
| Residencial Morumbi | 15 | 0 | 15 |

IDs e resultados completos: `output/whatsapp-piloto/genske-pilot-verified.json`. Nenhuma cobrança foi disparada durante a preparação.

## Templates enviados à Meta

Os três textos da Genske foram replicados na WABA e submetidos como `UTILITY`, idioma `pt_BR`, em 29/09/2026:

- `genske_cobranca_1_ptbr` — `1539825197914118`.
- `genske_cobranca_2_ptbr` — `1668789581532034`.
- `genske_cobranca_3_ptbr` — `2067631170522912`.

O conteúdo foi mantido; apenas as quebras de linha foram normalizadas e `{{condominio}}` convertido para `{{1}}`, com exemplo fictício. As três etapas da régua estão vinculadas aos nomes oficiais e ao parâmetro `condominio`; os payloads das 14 mensagens pendentes também foram atualizados. A criação retornou `PENDING` nos três modelos. Os flows continuam pausados.

## Habilitação em 01/10/2026

- Os três templates `genske_cobranca_1_ptbr`, `genske_cobranca_2_ptbr` e `genske_cobranca_3_ptbr` foram consultados na Meta e retornaram `APPROVED`, categoria `UTILITY`, idioma `pt_BR`.
- O token do piloto foi validado: `is_valid=true`, permissões de gestão e envio de WhatsApp, sem expiração programada informada pela Meta (`expires_at=0`, `data_access_expires_at=0`). A consulta da linha própria retornou HTTP 200 e qualidade `GREEN`.
- A configuração de produção da Vercel ainda apontava para a WABA e linha antigas. Foram atualizados `WHATSAPP_ACCESS_TOKEN` (mantido como Secret), `WHATSAPP_WABA_ID`, `WHATSAPP_PHONE_NUMBER_ID` e `WHATSAPP_APP_ID` para a integração do piloto.
- A carteira Escritório Genske Adv foi habilitada (`whatsapp_habilitado=true`), com transporte Cloud e Phone Number ID `1389253710929744`.
- Republicação iniciada a partir da versão de produção vigente, sem publicar arquivos locais: `dpl_ApVGmoiSpw7zTxvDccvpUENMXjAd`. O resultado da publicação será registrado após a verificação.
- Os quatro flows permanecem pausados; as 14 mensagens estão pendentes de aprovação e sem agendamento. Não foi solicitado disparo ao dispatcher nesta habilitação.
- Registros da operação: `output/whatsapp-piloto/activation-*.json`. Nenhum segredo foi incluído nesses registros.

Verificação da republicação: `READY`, `aliasAssigned=true`; o domínio `gkli-cob.vercel.app` foi consultado na API da Vercel e aponta para `dpl_ApVGmoiSpw7zTxvDccvpUENMXjAd`.

## Ativação dos flows em 01/10/2026

Por solicitação expressa do gestor ("pode ativar"), os três flows do piloto com mensagens foram ativados pela função operacional `email_ativar_flow`, que também agenda WhatsApp. Foram aprovadas e agendadas 12 mensagens do Verdana Suítes, uma do Residencial das Ilhas e uma do Verdana Residencial. O flow do Morumbi, sem mensagens, permaneceu pausado. Logs `flow_cobranca_retomado` registrados com a origem da autorização. Evidências em `output/whatsapp-piloto/flows-activation-*.json`.
