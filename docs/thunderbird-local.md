# Envio local pelo Thunderbird

Implementação inicial para a agenda central de e-mails de cobrança/acordos. A fila pré-jurídica não é consumida por este worker.

## Instalação

1. Empacote o conteúdo de `scripts/thunderbird/extension` na raiz de um ZIP com extensão `.xpi`.
2. No Thunderbird 128 ou posterior, abra Extensões e temas > engrenagem > Instalar de um arquivo. Selecione o XPI e revise as permissões.
3. Abra as opções da extensão GKLI e importe o JSON de conexão gerado pelo script de provisionamento. Esse arquivo contém uma credencial exclusiva do dispositivo: mantenha-o local e fora do Git.
4. Clique em **Enviar teste cadastrado**. O destinatário é definido no provisionamento, não pela extensão.
5. Confira o recebimento e o estado `enviado` antes de clicar em **Ativar fila automática**. A ativação muda apenas a carteira vinculada para o transporte Thunderbird. **Pausar fila** mantém esse transporte para impedir que o servidor SMTP assuma os envios.

O Thunderbird e o computador precisam permanecer ligados e conectados. A extensão consulta a fila a cada minuto, usando a identidade local cujo e-mail corresponda exatamente ao dispositivo. Não copia a senha ou os tokens OAuth da conta.

## Servidor

Aplicar `20260922190000_thunderbird_envios.sql` antes do deploy. Provisionar com:

```
node --env-file=.env.local scripts/thunderbird/provisionar.cjs <carteira-id> <email-remetente> <destinatario-teste>
```

O servidor guarda somente o hash do token do dispositivo. O endpoint `/api/integracoes/thunderbird` exige esse token e limita todas as operações à carteira vinculada. Os dois registros de configuração/entrega têm RLS e não podem ser acessados por anon/authenticated.

## Controle de envio

O transporte reaproveita a reserva atômica de e-mail, horários, limite diário, intervalo de dez minutos, aprovação e elegibilidade dos Flows. O SMTP do servidor bloqueia carteiras com transporte Thunderbird. Anexos usam URLs assinadas de curta duração; a extensão admite somente o Storage do projeto e até 20 MB por mensagem.

Antes de transmitir, registra uma tentativa local durável e obtém autorização final no servidor. Uma resposta perdida após envio não causa nova transmissão: somente a confirmação é repetida. Reinício durante transmissão registra `incerto`. Reservas abandonadas, resultados incertos e falhas precisam de conferência; não há expiração que libere reenvio automático.

Para retirar um dispositivo, desative `thunderbird_dispositivos.ativo`. Para voltar ao SMTP, confira primeiro todas as tentativas pendentes e configure `carteiras.email_transporte='smtp'`. Não libere reenvios sem comparar o registro com a pasta Enviados do Thunderbird.

## Validação

Seis testes de worker cobrem sucesso, falha de confirmação, erro de envio, falta de anexos, pausa e recuperação. Testes SQL executados em transação com rollback verificam exclusividade, idempotência, bloqueio SMTP, pausa, resultados incertos e permissões. A confirmação SMTP significa aceite pelo servidor, não comprovação de leitura ou entrega na caixa de entrada.
