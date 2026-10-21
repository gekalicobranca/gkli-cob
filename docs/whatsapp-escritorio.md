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

## Inicialização automática no Windows

Executar `scripts/whatsapp-web/install-channels-persistent.ps1` cadastra as
tarefas `GKLI-WhatsApp-Escritorio` e `GKLI-WhatsApp-Painel` para o usuário atual.
Elas iniciam após o login, com atrasos de 45 e 60 segundos, e possuem um
gatilho de recuperação a cada cinco minutos. Não exigem senha armazenada nem
privilégios de administrador. O usuário precisa entrar no Windows após reiniciar.

O runner acompanha o supervisor e o painel já existentes sem encerrá-los.
Se o processo sair, tenta iniciá-lo novamente após 15 segundos. Cada runner
tem mutex próprio; tarefas simultâneas não abrem cópias adicionais. Logs em
`.whatsapp-web/persistent-escritorio.log` e `persistent-painel.log`.
As tarefas existentes `GKLI-WhatsApp-Supervisor` e `GKLI-Maestro-Supervisor`
continuam responsáveis pelas outras sessões e pelos coletores.

Neste notebook, manter o uso na tomada: suspensão e hibernação automáticas
desabilitadas na tomada, ação de fechar a tampa sem suspender e Wi-Fi em
desempenho máximo na tomada. A tela pode apagar normalmente. O fechamento
da tampa não deve bloquear a ventilação. As configurações anteriores e os
XMLs das tarefas estão em `.local/worker-stability/` no computador configurado.
Não foi alterada a configuração de bateria.

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
