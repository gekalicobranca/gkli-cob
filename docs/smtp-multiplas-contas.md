# Várias contas SMTP na mesma carteira

Em Configurações → Integrações, selecione a carteira e use **Adicionar conta SMTP**. Cada conta pode ser editada, ativada e testada separadamente. Salvar uma nova conta não substitui a anterior. A identidade autenticada de uma conta existente é preservada; para outro endereço, crie uma conta nova. A senha nunca volta para a tela. OAuth Google também identifica a conta escolhida.

Os novos agendamentos de flows escolhem a conta ativa com o primeiro horário disponível, em transação serializada. Cada caixa autenticada mantém até 100 tentativas por dia de Brasília e dois minutos entre envios, somando todas as carteiras que a utilizem. A configuração `email_limite_diario` continua limitando cada conta dentro da carteira. Aliases não aumentam o limite. Contas cadastradas antes desta mudança têm preferência em caso de empate; avisos internos e mensagens avulsas conservam a conta principal.

A reserva em `email_agenda` guarda `smtp_config_id` e o endereço autenticado. O provedor consulta essa reserva no servidor antes de carregar a credencial. Acrescentar uma conta não muda reservas existentes nem redistribui mensagens enviadas, em andamento ou incertas. Para alterar a conta de uma mensagem ainda não iniciada, é necessário reagendá-la. Uma conta inativa ou fora do escopo bloqueia a reserva antiga, em vez de trocar de remetente silenciosamente.

Rotas específicas por condomínio continuam exclusivas e são reconferidas contra carteira, cobrança/acordo e condomínio. O transporte Thunderbird conserva sua identidade e não participa do pool SMTP. As janelas de envio, elegibilidade financeira, aprovação, bloqueios e flows pausados continuam sujeitos às mesmas travas finais. A migração não ativa flows ou envia mensagens.

As funções de candidatos, credencial da reserva e cálculo de horário são privadas, executáveis somente por `service_role`. Credenciais continuam na tabela SMTP protegida por RLS, sem leitura/escrita direta de `anon` ou `authenticated`. O payload da mensagem não escolhe contas.

Validação: `node --test scripts/validate-email-contas.cjs scripts/thunderbird/worker.test.cjs`, `npm run typecheck` e ESLint nos arquivos alterados. Os testes SQL cobrem limites por conta e entre carteiras, cadência, reserva final, pinagem, desativação, rotas por condomínio, contas externas, pausas, resultados incertos, janela e Thunderbird. Os testes não enviam e-mails reais.
