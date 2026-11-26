# Conexões WhatsApp no Railway

Implementação iniciada em 26/11/2026, em checkout isolado da árvore local de operação. Projeto exclusivo **GKLI WhatsApp**, ID `39d13c10-ee91-40ce-bf85-bca0dc345405`; ambiente production `990c835d-2c10-453a-8e37-8b8fc0db4139`.

## Execução

Um serviço e um volume persistente `/data` por sessão; uma única réplica. O supervisor remoto consulta os comandos do app e inicia o Chromium no próprio Railway. Não usa tarefas agendadas Windows, painel localhost, arquivos `.env` locais nem perfis antigos. QR e código aparecem somente no app autenticado, sujeitos às permissões já existentes.

Dockerfile: `scripts/whatsapp-web/Dockerfile`, contexto raiz. Configure healthcheck `/health`, timeout 120 segundos, draining 30 segundos, overlap zero, restart ON_FAILURE (10), sem sleep. O volume impede deployments concorrentes; `flock` também impede dois supervisores no mesmo volume. Plano observado permite volume de 500 MB. Monitorar consumo; não apagar automaticamente sessões por falta de espaço.

Variáveis por serviço: `WHATSAPP_WEB_SESSION`, `WHATSAPP_WEB_RUNTIME=railway`, `WHATSAPP_WEB_PROCESS_MESSAGES=false`, `WHATSAPP_WEB_CHROME_PATH=/usr/bin/chromium`, `PUPPETEER_SKIP_DOWNLOAD=true`, `TZ=America/Sao_Paulo`, além da URL Supabase e chave service role mantidas apenas no ambiente secreto. `RAILWAY_VOLUME_MOUNT_PATH` é injetada pelo Railway. O telefone esperado vem do cadastro da carteira/rota de grupo, com validação de unicidade; não duplicar no ambiente.

**Iniciar conexão não libera envios.** O processamento exige opt-in explícito no serviço (`WHATSAPP_WEB_PROCESS_MESSAGES=true`) e todos os bloqueios existentes no banco, na carteira, nas rotas, no Flow e na mensagem. A implantação inicial permanece somente conexão, com controles pausados. Não reativa mensagens anteriores.

## Comandos e integridade

Reinício mantém o perfil persistente. Desconectar e limpar vínculo exige administrador; a solicitação auditada desabilita a linha e é recusada se houver tentativa reservada. O supervisor encerra o worker antes de limpar apenas o diretório de autenticação de sua própria sessão. A confirmação idempotente mantém a linha pausada. Mensagens, tentativas, cobranças, acordos e auditoria permanecem intactos.

A migration `20261126193000_whatsapp_desconexao_remota.sql` preserva a implementação instalada da reserva e acrescenta bloqueio por sessão com o mesmo lock da solicitação de desconexão. O acesso às RPCs permanece exclusivo de service_role. Tentativas sem confirmação não são reenviadas automaticamente.

## Verificação e implantação

Antes da implantação: testes do worker, testes de configuração cloud, teste PGlite da migration e typecheck. Build Linux/Chromium e healthcheck precisam ser verificados no Railway; testes locais não provam pareamento remoto.

Serviço piloto: `whatsapp-genske` (`176559fe-969d-41b2-bba7-1b0ca8c97c43`), volume `genske-sessao` (`44133128-d99f-4a23-8229-c6bb0e6eca8c`). Replicar as demais sessões somente após validar o piloto. Estado de implantação e pendências devem ser atualizados ao concluir a operação.

O cleanup anterior permanece preservado: perfis Windows estão em quarentena e não são fonte de sessão para esta infraestrutura. Pareamento é novo. Conectar o celular requer ação humana; nunca registrar QR, código de vinculação ou segredos nesta documentação.

## Estado em 26/11/2026

### Investigação após pareamento (17h17, Brasília)

O QR inicial não validava o ciclo autenticado completo. Após o usuário parear as quatro linhas, foram observados travamentos na inicialização e no probe de saúde. PR #93 permanece em investigação: estado `iniciando` após autenticação, consulta do socket já inicializado e remoção exclusiva dos symlinks Singleton obsoletos de contêiner anterior. A limpeza de locks recuperou a sessão Azevedo sem novo pareamento. Mensagens e credenciais não foram apagadas.

Azevedo confirmou 6828 e permaneceu conectada em sucessivos heartbeats. Genske e GEKALI confirmaram 7774/0545, mas voltaram a timeout; Escritório ainda não confirmou número. Portanto não considerar as quatro linhas recuperadas. Isolar os event handlers de mensagens no modo conexão não resolveu o timeout da GEKALI; a hipótese de falha exclusivamente no probe ainda não está comprovada. Investigar travamento do contexto Chromium/integração após ready antes de liberar processamento.

Versões remotas durante diagnóstico: Azevedo/Genske/Escritório `8ec07363`; GEKALI `56602f13`. Todos continuam com `WHATSAPP_WEB_PROCESS_MESSAGES=false`, carteiras e controle global desabilitados. Não reenviar mensagens nem limpar perfis como tentativa de recuperação.

Migration aplicada ao projeto Supabase GKLI COB (`vjcmotflmcczoepflhwc`). Carteiras configuradas com suas sessões e números esperados, mantendo `whatsapp_habilitado=false` e a pausa global de WhatsApp. Nenhuma mensagem ou tentativa foi reativada.

O piloto Genske passou build Docker, healthcheck e gerou QR Code no Chromium remoto. Não foi pareado um celular nesta validação. Os serviços usam o commit `b47f485c` fixado; pushes posteriores não mudam automaticamente o conector.

Serviços adicionais: Escritório `c1296ec3-20ef-46d0-ad22-7d78dee91088`, GEKALI `613f6e11-538f-40c9-8e58-ac74b30c199a`, Azevedo `243e39a8-3e30-45be-9698-abffb92b1be3`, cada um com volume próprio de 500 MB. Os quatro serviços passaram build e healthcheck, com uma réplica online cada, sem falhas de implantação. As quatro sessões geraram QR no servidor e publicaram o payload no controle privado do app; conteúdo não registrado em logs ou documentação.

Controles de conexão das quatro linhas iniciados para validar os QRs; envios seguem bloqueados nos serviços (`WHATSAPP_WEB_PROCESS_MESSAGES=false`), nas quatro carteiras e no controle global. O QR expira normalmente; use o botão do app para solicitar outro quando necessário. O pareamento e a persistência de uma sessão autenticada dependem da conexão pelo celular e ainda não foram validados. Publicação da UI acompanha o PR #92.

O plano gratuito recusou a quinta linha. O usuário escolheu manter quatro por enquanto. RISE UP permanece sem serviço, controle pausado e rota inativa; o cadastro e histórico ficam preservados. Não consolidar suas credenciais no serviço GEKALI para contornar esse limite.
