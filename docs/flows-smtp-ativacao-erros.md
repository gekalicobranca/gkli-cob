# SMTP do Domo e retorno de ativação de Flows

Correção de 22/11/2026 sobre `03141748`, em worktree isolada. Usuário autorizou corrigir a rota SMTP e publicar o tratamento de erro, sem ativar ou reenviar mensagens automaticamente.

## Ajuste aplicado no GKLI - COB

A rota do Domo Residencial Life (`64350e69-b812-4d6c-8e13-54b6958452a2`) apontava para carteira e conta diferentes da carteira atual, Genske Advogados (`06827218-e2b1-4267-ad8f-81a0ab222cad`). Foi vinculada à conta principal ativa dessa carteira, prioridade 0 (`d4a72ae9-8bb8-423e-a40b-8d22ac5bad5b`). From e Reply-To passaram a usar o remetente cadastrado nessa conta; ambos apontavam antes para a identidade da conta antiga. Nenhuma conta foi movida, nenhuma credencial foi lida ou alterada e outras rotas foram preservadas.

Operação restrita à rota do condomínio, com guarda dos IDs anteriores e da carteira atual, registrada em `auditoria_eventos` (`smtp.rota_corrigida`) com antes/depois para reversão. Consulta posterior confirmou rota e conta ativas na carteira atual, remetente compatível e Reply-To correspondente. O Flow `c983cef4-a684-4f36-b0ea-beba06cb7647` permaneceu pronto, com mensagem pendente de aprovação e zero tentativas. Nenhuma RPC de ativação ou transmissão foi executada para validar o ajuste.

## Tratamento de erro

`enviarFlowCobranca` devolve `ResultadoAtivacaoFlow`: sucesso explícito ou erro tratável. Mensagens SMTP conhecidas são convertidas em instruções legíveis; erros desconhecidos não devolvem detalhes de SQL, transporte ou configuração sensível. Falha de transporte orienta conferir o estado antes de tentar novamente, sem repetir a RPC. Uma falha posterior à confirmação da RPC devolve sucesso com aviso de conferência, evitando tratar ativação confirmada como motivo para tentar de novo.

A ativação em lote só conta e retira da seleção os sucessos confirmados. A ativação individual usa o mesmo retorno e mostra alerta junto ao botão. Os dois caminhos só são disparados por interação explícita; não há efeito de montagem, polling de ativação, retry automático ou reenvio. As verificações de papel e carteira permanecem no servidor.

## Validação

`validate-flow-smtp-ativacao.ts` cobre rota inválida, remetente indisponível, acesso/status, transporte incerto, sucesso clássico/Easy, falha posterior à confirmação e sanitização. `validate-flow-smtp-ui.mjs` usa as interfaces reais no Edge headless com Server Action simulada: alerta legível, ausência de React #441, contagem correta no lote e nenhuma chamada na montagem ou retry automático. Testes locais de canais, chaves históricas, pausas e conciliação também foram executados: 29 testes aprovados no conjunto.

Revisão React: hooks no topo, mutações apenas em eventos, botões de ação explícita com estados de carregamento/desabilitado, alertas acessíveis, sem exposição de erro bruto do servidor. Publicação deve confirmar quality, Preview e o commit no domínio de produção. Não há migration.
