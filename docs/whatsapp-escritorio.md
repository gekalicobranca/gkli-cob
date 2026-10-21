# WhatsApp do Escritório Genske Adv

A carteira `36b6c087-56d2-4297-be63-6dcbe02a9f00` usa a sessão WhatsApp Web
`escritorio`, telefone `551135027775`. A sessão `genske` continua independente,
no telefone final 7774.

O supervisor padrão continua atendendo somente Genske, GEKALI e Azevedo.
Para iniciar o supervisor exclusivo do Escritório, na pasta
`scripts/whatsapp-web`:

```powershell
node --env-file=../../.env.local --env-file=../../.env.whatsapp-escritorio supervisor.mjs
```

O arquivo local ignorado `.env.whatsapp-escritorio` contém:

```dotenv
WHATSAPP_WEB_SESSION=escritorio
WHATSAPP_WEB_PHONE=551135027775
WHATSAPP_WEB_AUTH_PATH=.whatsapp-web/auth-escritorio
WHATSAPP_WEB_SUPERVISOR_SESSIONS=escritorio
```

Esse supervisor usa `.whatsapp-web/supervisor-escritorio.lock`, sem disputar
o lock das outras sessões. A autenticação não deve ser apagada nem compartilhada.
O painel local `http://localhost:3877/` inclui o QR Code do Escritório.

## Conector Meta preservado

A alteração modifica somente `whatsapp_transporte`, `whatsapp_web_sessao`
e `whatsapp_web_numero` da carteira. Os campos `whatsapp_numero_proprio`,
`whatsapp_phone_number_id`, `whatsapp_waba_id` e `whatsapp_remetente_modo`
permanecem cadastrados. O evento `whatsapp_conector_criado` em
`auditoria_eventos` armazena a configuração anterior em `antes`.

Para reutilizar a API Meta nessa carteira, pausar o worker `escritorio` e
selecionar o transporte `cloud` na configuração. Conferir a validade das
credenciais Meta antes de retomar envios. O dispatcher cloud processa somente
carteiras com transporte `cloud`; os dois conectores não são usados em paralelo.
