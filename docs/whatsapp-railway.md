# Conexões WhatsApp no Railway

Implementação iniciada em 26/11/2026, em checkout isolado da árvore local de operação. Projeto exclusivo **GKLI WhatsApp**, ID `39d13c10-ee91-40ce-bf85-bca0dc345405`; ambiente production `990c835d-2c10-453a-8e37-8b8fc0db4139`.

## Execução

Um serviço e um volume persistente `/data` por sessão; uma única réplica. O supervisor remoto consulta os comandos do app e inicia o Chromium no próprio Railway. Não usa tarefas agendadas Windows, painel localhost, arquivos `.env` locais nem perfis antigos. QR e código aparecem somente no app autenticado, sujeitos às permissões já existentes.

Dockerfile: `scripts/whatsapp-web/Dockerfile`, contexto raiz. Configure healthcheck `/health`, timeout 120 segundos, draining 30 segundos, overlap zero, restart ON_FAILURE (10), sem sleep. O volume impede deployments concorrentes; `flock` também impede dois supervisores no mesmo volume. Plano observado permite volume de 500 MB. Monitorar consumo; não apagar automaticamente sessões por falta de espaço.

Variáveis por serviço: `WHATSAPP_WEB_SESSION`, `WHATSAPP_WEB_RUNTIME=railway`, `WHATSAPP_WEB_PROCESS_MESSAGES=false`, `WHATSAPP_WEB_CHROME_PATH=/usr/local/bin/gkli-chrome`, `PUPPETEER_SKIP_DOWNLOAD=true`, `TZ=America/Sao_Paulo`, além da URL Supabase e chave service role mantidas apenas no ambiente secreto. `RAILWAY_VOLUME_MOUNT_PATH` é injetada pelo Railway. O telefone esperado vem do cadastro da carteira/rota de grupo, com validação de unicidade; não duplicar no ambiente.

**Iniciar conexão não libera envios.** O processamento exige opt-in explícito no serviço (`WHATSAPP_WEB_PROCESS_MESSAGES=true`) e todos os bloqueios existentes no banco, na carteira, nas rotas, no Flow e na mensagem. A implantação inicial permanece somente conexão, com controles pausados. Não reativa mensagens anteriores.

## Comandos e integridade

Reinício mantém o perfil persistente. Desconectar e limpar vínculo exige administrador; a solicitação auditada desabilita a linha e é recusada se houver tentativa reservada. O supervisor encerra o worker antes de limpar apenas o diretório de autenticação de sua própria sessão. A confirmação idempotente mantém a linha pausada. Mensagens, tentativas, cobranças, acordos e auditoria permanecem intactos.

A migration `20261126193000_whatsapp_desconexao_remota.sql` preserva a implementação instalada da reserva e acrescenta bloqueio por sessão com o mesmo lock da solicitação de desconexão. O acesso às RPCs permanece exclusivo de service_role. Tentativas sem confirmação não são reenviadas automaticamente.

## Verificação e implantação

Antes da implantação: testes do worker, testes de configuração cloud, teste PGlite da migration e typecheck. Build Linux/Chromium e healthcheck precisam ser verificados no Railway; testes locais não provam pareamento remoto.

Serviço piloto: `whatsapp-genske` (`176559fe-969d-41b2-bba7-1b0ca8c97c43`), volume `genske-sessao` (`44133128-d99f-4a23-8229-c6bb0e6eca8c`). Replicar as demais sessões somente após validar o piloto. Estado de implantação e pendências devem ser atualizados ao concluir a operação.

O cleanup anterior permanece preservado: perfis Windows estão em quarentena e não são fonte de sessão para esta infraestrutura. Pareamento é novo. Conectar o celular requer ação humana; nunca registrar QR, código de vinculação ou segredos nesta documentação.

## Estado em 26/11/2026

### Recuperação após pareamento (17h42, Brasília)

O QR inicial não validava o ciclo autenticado completo. O diagnóstico do renderer confirmou `oom_kill=1` nos contadores cgroup: o Chrome completo excedia a memória do plano e o processo da página era encerrado, embora o supervisor continuasse online. Aumento para 2 GB foi recusado pelo plano; o usuário escolheu manter o plano atual.

Correção: Chrome Headless Shell 153.0.8010.36 fixado no Docker, Puppeteer 24.38.0 conforme dependência do conector, modo de baixo consumo e heap limitado a 128 MB. Limite explícito de 1 GB por serviço. A revisão do navegador é mantida para preservar compatibilidade dos perfis já abertos; não fazer downgrade automático. Reinícios removem somente symlinks Singleton pertencentes ao contêiner anterior, sob exclusividade do volume/flock, nunca cookies ou bancos de autenticação.

O Escritório apresentou socket `CONNECTED`, mas não fornecia o indicador legado `hasSynced`. Em modo somente conexão, o heartbeat agora exige socket atual conectado e número PN da própria conta, consultados no navegador. Número ausente não confirma conexão; número diferente interrompe a sessão. Não usa LID como telefone nem emite um evento `ready` artificial. Processamento continua dependente da inicialização completa do conector, além de todos os bloqueios existentes. Não liberar mensagens com base apenas na validação do modo conexão.

As quatro sessões confirmaram números esperados em 26/11: Genske 7774, Escritório 7775, GEKALI 0545, Azevedo 6828. Os vínculos foram restaurados dos volumes sem novo pareamento. Posteriormente, às 17h44 (Brasília), a sessão Escritório recebeu `LOGOUT` do WhatsApp, enquanto o navegador seguia respondendo sem OOM. Portanto essa linha precisa de nova confirmação pelo celular; não considerar as quatro conectadas após esse evento. As outras três mantiveram socket e identidade confirmados. A origem do LOGOUT não foi determinada; não atribuir ao usuário sem confirmação.

O worker interrompe a sessão em LOGOUT, sinaliza falha de autenticação ao supervisor e ignora eventos tardios de código/QR/ready durante encerramento. Um pedido de vinculação só pode ser reutilizado por até quatro minutos e se ainda corresponder ao comando atual; reinício não renova pedidos antigos de código. Isso não restaura uma credencial revogada pelo WhatsApp.

O usuário confirmou que não havia desconectado a 7775 e realizou nova vinculação pelo celular às 17h49. O conector confirmou autenticação e `ready`; às 17h51 as quatro linhas voltavam a confirmar socket, número esperado e sinais recentes. Os três outros vínculos foram preservados sem novo pareamento, inclusive após substituição dos contêineres. Nenhum histórico operacional ou tentativa foi removido. Nenhuma tentativa de envio foi criada durante a correção.

Versão remota validada e fixada `f8e927d5`, PR #93. A implantação não habilita envios: `WHATSAPP_WEB_PROCESS_MESSAGES=false`, carteiras e controle global desabilitados. Falha futura do renderer é registrada com contadores de recursos e encerra o worker para recuperação preservando o perfil. Dados de mensagens/QR/credenciais não entram nos diagnósticos. A UI distingue `Conectado · envios pausados` de falha de conexão e informa execução no Railway. Validação: 52 testes do worker, 7 testes de configuração/migration e 8 verificações do status operacional; build Linux e recuperação real das sessões no Railway. Isso valida modo conexão, não autoriza disparos.

Migration aplicada ao projeto Supabase GKLI COB (`vjcmotflmcczoepflhwc`). Carteiras configuradas com suas sessões e números esperados, mantendo `whatsapp_habilitado=false` e a pausa global de WhatsApp. Nenhuma mensagem ou tentativa foi reativada.

O primeiro piloto Genske validava apenas build, healthcheck e geração do QR. A recuperação descrita acima inclui o pareamento feito pelo usuário e a verificação de identidade. Pushes posteriores não mudam automaticamente o conector, pois os serviços usam commit fixado.

Serviços adicionais: Escritório `c1296ec3-20ef-46d0-ad22-7d78dee91088`, GEKALI `613f6e11-538f-40c9-8e58-ac74b30c199a`, Azevedo `243e39a8-3e30-45be-9698-abffb92b1be3`, cada um com volume próprio de 500 MB. Os quatro serviços passaram build e healthcheck, com uma réplica online cada, sem falhas de implantação. As quatro sessões geraram QR no servidor e publicaram o payload no controle privado do app; conteúdo não registrado em logs ou documentação.

Controles das quatro conexões iniciados; envios seguem bloqueados nos serviços, nas carteiras e no controle global. A persistência foi verificada na recuperação dos vínculos após substituição dos contêineres. Publicação inicial da UI: PR #92. Ainda será necessária validação separada do processamento completo antes de autorizar disparos.

O plano gratuito recusou a quinta linha. O usuário escolheu manter quatro por enquanto. RISE UP permanece sem serviço, controle pausado e rota inativa; o cadastro e histórico ficam preservados. Não consolidar suas credenciais no serviço GEKALI para contornar esse limite.

## Liberação dos envios em 26/11/2026, 18h10 (Brasília)

Após solicitação explícita do usuário, as quatro carteiras tiveram `whatsapp_habilitado=true`, os quatro serviços receberam `WHATSAPP_WEB_PROCESS_MESSAGES=true` e o controle global `workers_controles.whatsapp` foi habilitado. A abertura no banco foi transacional, auditada e condicionada às quatro sessões com número correto, sinal recente e monitor em estado `operando`. Nenhum Flow foi retomado, nenhuma mensagem foi recriada ou reagendada e os resultados incertos permaneceram para conferência.

Foi necessário compatibilizar a inicialização completa de eventos: o módulo legado de socket bloqueava a instalação dos listeners. No Railway o worker instala apenas os hooks que consome: recibos das próprias mensagens e mudança de estado do socket já autenticado. As APIs de envio/serialização precisam existir antes de completar a inicialização; não há evento `ready` artificial. Recibos preservam ID, corpo, destino, origem e timestamp exigidos pela verificação existente. Hooks não transmitem mensagens. Execução local conserva o caminho anterior.

Conector em produção fixado no commit `e8224ff9`, branch `codex/whatsapp-liberar-envios`, PR #95. As quatro linhas confirmaram inicialização completa e modo `operando`. Índice exclusivo de tentativa ativa por mensagem, fingerprint, trava de reserva, bloqueio de mensagens já enviadas e de resultados incertos, elegibilidade financeira, status do Flow, destinatários bloqueados, cadência e quota continuam inalterados. A rota RISE UP permanece inativa.

A janela da reserva vigente é 09h–18h em America/Sao_Paulo. Como a liberação ocorreu após 18h, nenhum envio de teste foi disparado; mensagens elegíveis seguem a agenda e a próxima janela. Validação: testes do worker incluindo hooks e recibos, observação dos quatro serviços/monitores e consulta das permissões após a operação. O estado anterior de envios pausados descrito acima é histórico.

## Exceção Home Design Pinheiros — 27/11/2026

Por solicitação do usuário, o Home Design Pinheiros usa a linha padrão GEKALI (final 0545), apesar de permanecer cadastrado no grupo RISE UP. A tabela privada `whatsapp_web_excecoes_grupo` autoriza somente o condomínio explicitamente cadastrado a ignorar a rota de grupo. Não armazena sessão/carteira alternativa: a linha vem da própria carteira, e as validações de carteira e de condomínio entre cobrança/acordo permanecem na RPC. RLS habilitada, sem acesso anon/authenticated; administração somente por service_role e com auditoria.

Migration `20261127155621_whatsapp_excecao_rota_condominio.sql` aplicada em GKLI COB. O normalizador de assinatura respeita a mesma exceção, inclusive se a rota de grupo for ativada futuramente, e continua ignorando mensagens enviadas/canceladas. Não foram alterados grupo, rota RISE UP, Flows, agenda, fingerprint, ID, contador de tentativas ou regras de reserva/duplicidade. Foram alinhadas apenas as assinaturas das duas mensagens agendadas já existentes; mensagens confirmadas não foram recolocadas na fila. Os casos incertos foram comparados integralmente antes/depois, sem alterações.

Teste PGlite cobre exceção isolada entre condomínios do mesmo grupo, rota de grupo ativa/inativa, conflito de carteira, divergência cobrança/acordo, permissões/RLS, assinatura pendente e preservação de histórico enviado. Operação e evidências locais em `outputs/home-design-whatsapp-20261127/`. O worker usa a RPC em tempo real; não há reinício de sessão ou novo pareamento para aplicar a rota.

Resultado operacional: as duas mensagens existentes foram confirmadas pela sessão GEKALI às 12h57 e 12h58 (Brasília), cada uma com uma única tentativa e um recibo. O Flow concluiu pelo processamento normal; nenhuma mensagem confirmada foi recolocada na fila.
