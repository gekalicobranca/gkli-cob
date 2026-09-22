# WhatsApp Web temporário para Flows

Implementado em 17/09/2026. Transporte automático alternativo por carteira, preservando o canal `whatsapp`, o conteúdo renderizado, anexos e a agenda dos Flows de cobrança, acordos e pré-jurídico.

## Instalação e conexão

1. Aplicar `supabase/migrations/20260917120000_whatsapp_web_flows.sql` antes de publicar o dispatcher atualizado. A migração não muda o transporte de carteiras existentes; o padrão continua `cloud`.
2. Em **Configurações → WhatsApp Web temporário**, selecionar Web e informar nome de sessão e número com DDI/DDD. Salvar habilita os Flows já ativos e agendados para esse transporte assim que o worker conectar.
3. No computador persistente, usar Node >= 22.12 e executar `npm ci --prefix scripts/whatsapp-web`. Chromium é instalado pelo Puppeteer. As dependências do worker ficam isoladas do app Next/Vercel. O override do Puppeteer elimina as vulnerabilidades do extrator ZIP da versão fixada pelo whatsapp-web.js; a inicialização do navegador foi verificada localmente.
4. Manter as credenciais Supabase em `.env.local` (apenas servidor). Para uma sessão genérica, definir `WHATSAPP_WEB_SESSION` e `WHATSAPP_WEB_PHONE`, depois executar `npm start --prefix scripts/whatsapp-web`.
5. Executar `npm run qr --prefix scripts/whatsapp-web` e abrir `http://127.0.0.1:3877` no mesmo computador. O painel local atualiza os QR Codes automaticamente. Ler pelo WhatsApp do número indicado, em **Dispositivos conectados → Conectar dispositivo**. O worker compara a linha real com a configuração antes de enviar. O QR também aparece no terminal.

As três sessões locais preparadas usam arquivos `.env.whatsapp-*`, ignorados pelo Git:

| Carteira | Sessão | Número | Comando, na raiz do projeto |
| --- | --- | --- | --- |
| Genske Advogados | genske | 551135027774 | `npm run start:genske --prefix scripts/whatsapp-web` |
| GEKALI | gekali | 5511993393982 | `npm run start:gekali --prefix scripts/whatsapp-web` |
| Azevedo Araújo | azevedo | 5511921486828 | `npm run start:azevedo --prefix scripts/whatsapp-web` |

Executar cada comando em seu próprio processo. O computador deve permanecer ligado, com internet e sem suspensão. Não executar a mesma sessão em dois processos. Os perfis persistem em `.whatsapp-web/auth` e não devem ser copiados para Git, hospedagem pública ou compartilhamentos. `WHATSAPP_WEB_CHROME_PATH` permite usar um Chrome instalado quando necessário.

Para conectar e conferir a linha sem reservar nem enviar mensagens, acrescentar `-- --connect-only` ao comando npm, por exemplo: `npm run start:gekali --prefix scripts/whatsapp-web -- --connect-only`. O painel identifica esse modo após a conexão. Para habilitar o processamento, encerrar esse processo e iniciar novamente sem a opção.

Para vincular por código em vez de QR, acrescentar também `--pair-by-code`: `npm run start:azevedo --prefix scripts/whatsapp-web -- --connect-only --pair-by-code`. O painel local apresenta o código, renovado a cada três minutos, para confirmação no WhatsApp do celular da linha configurada. O código fica apenas no estado local, sem gravação no banco ou nos logs. O login feito em outro navegador não conecta o worker.

`WHATSAPP_WEB_AUTH_PATH` permite uma pasta de perfil alternativa. A sessão local Azevedo usa `.whatsapp-web/auth-azevedo`, após reinicialização de um perfil que ainda não tinha sido autenticado. Não trocar a pasta de uma sessão autenticada sem planejar nova leitura de QR Code. A espera inicial pelo QR expira após 15 minutos; nesse caso reiniciar o comando da sessão.

## Execução e limites

- Reserva transacional no banco somente de mensagens agendadas cujo horário chegou, em Flow ativo, da carteira/sessão/linha configuradas. Nenhum Flow é ativado pelo worker.
- Máximo inicial de 50 tentativas/dia por número, compartilhadas entre suas carteiras, das 09h às 18h em São Paulo; intervalo mínimo de 60 segundos. São limites operacionais, sem garantia contra restrições da plataforma.
- Conferência de opt-out, conteúdo, número e download de todos os anexos antes da primeira transmissão. Texto é seguido pelos anexos como documentos, com limite operacional de 16 MB por arquivo.
- Nova conferência de Flow e sessão imediatamente antes do envio. Pausa/cancelamento impede novas reservas; uma transmissão já iniciada pode terminar.
- Recibos, status da mensagem, todos os itens vinculados, contadores de lote/Flow, procuração e logs são atualizados em uma transação. “Enviada” indica retorno do cliente Web, não comprovação de entrega ou leitura.
- A API oficial ignora carteiras Web. O banco também impede reservas por workers Cloud antigos durante a transição. Mensagens já assumidas pelo Web não são transferidas automaticamente para a API.
- Falha anterior à transmissão fica disponível para reenvio pelo Flow. Qualquer erro após iniciar transmissão, inclusive envio parcial, fica incerto e bloqueia a linha; não há expiração automática.
- Queda do worker após reservar também mantém a reserva bloqueada. Não apagar reservas para forçar repetição.

## Conferência de resultados incertos

Parar o worker e conferir a conversa no WhatsApp. Na página de configuração, abrir a reserva e registrar o resultado, com justificativa:

- **Texto e todos os anexos enviados**: conclusão administrativa auditada, identificada por `confirmacao_manual` nos recibos. Não representa recibo da plataforma.
- **Nada enviado**: libera reenvio explícito pelo Flow, sem reagendar automaticamente.
- **Envio parcial**: completar os anexos na conversa e depois confirmar o conjunto; a aplicação impede liberar o reenvio integral quando existem recibos parciais.

Reiniciar o worker após a conferência. Desconexão ou falha de autenticação exige reinício e, se necessário, novo QR Code. A tela mostra o último heartbeat; atualizar a página para renovar o estado.

## Retorno à API oficial

Parar o worker, resolver reservas em andamento/incertas, configurar a linha e os templates oficiais e mudar a carteira para `cloud`. Mensagens que nunca foram assumidas pelo Web seguem pela API. Falhas já assumidas pelo Web devem ser resolvidas nesse transporte antes da troca; não mudar manualmente o provider para contornar reservas.

Integração não oficial baseada em [whatsapp-web.js](https://wwebjs.dev/guide/), sujeita a mudanças do WhatsApp Web e restrições de conta. O login usa [LocalAuth](https://wwebjs.dev/guide/creating-your-bot/authentication.html), que exige armazenamento persistente. Não executar dentro de funções efêmeras da Vercel.

## Validação

`node --test scripts/validate-whatsapp-web.mjs scripts/whatsapp-web/worker.test.mjs`

Testes usam PostgreSQL local via PGlite e cliente simulado: isolamento de carteira/linha, pausa, agenda, Cloud antigo, reserva única, conclusão idempotente, atualização dos itens, resultados incertos, conferência administrativa, bloqueio de reenvio e falhas de anexos/recibos. Não enviam mensagens reais. Executar também `npm run typecheck`.
