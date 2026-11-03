# WhatsApp RISE UP na GEKALI

A linha 11 97364-1030 usa a sessão isolada `riseup`, vinculada ao grupo
`RISE UP` dentro da carteira GEKALI. Não é uma nova carteira: as mensagens
continuam usando seus templates, réguas, controles financeiros e operadora.
O grupo em outra carteira não usa esta linha.

A tabela privada `whatsapp_web_rotas_grupo` define a substituição do remetente.
A reserva e a confirmação anterior à transmissão consultam os vínculos
financeiros e o grupo atual, sem aceitar roteamento pelo payload.
Uma rota cadastrada e inativa bloqueia o envio; não usa a linha padrão.
Mensagens de outros grupos continuam na sessão padrão da carteira.
O limite móvel de 20 mensagens em 24h continua compartilhado pelo número físico.

Configuração local em `.env.whatsapp-riseup` (sem credenciais):

```dotenv
WHATSAPP_WEB_SESSION=riseup
WHATSAPP_WEB_PHONE=5511973641030
WHATSAPP_WEB_AUTH_PATH=.whatsapp-web/auth-riseup
WHATSAPP_WEB_SUPERVISOR_SESSIONS=riseup
```

O painel local inclui o novo código. Para conectar sem enviar, iniciar
`worker.mjs --connect-only --pair-by-code` com os arquivos de ambiente locais.
Manter `whatsapp_worker_controles.habilitado=false` até liberação explícita.
O supervisor `riseup` e seu lock são separados das quatro sessões existentes.
Para instalar a recuperação após login, executar
`install-channels-persistent.ps1 -Channels riseup`.
