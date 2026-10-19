# Remetente dos flows do Oásis

Autorização do operador em 19/10/2026: os e-mails dos flows do Oásis usam `lidia@genskeadvogados.com.br` como remetente e endereço de resposta. O SMTP padrão da carteira Genske Advogados permanece com Camila para os demais condomínios. As regras de acordo do Oásis continuam aguardando confirmação; esta configuração não as altera.

A tabela administrativa `integracoes_smtp_rotas_condominio` vincula o condomínio à configuração SMTP já cadastrada da Lidia, sem copiar senhas e sem mover o condomínio de carteira. A tabela é exclusiva do servidor, com RLS e permissões revogadas para clientes anônimos e autenticados. Somente uma alteração administrativa confiável pode cadastrar uma rota; o payload de uma mensagem nunca escolhe uma credencial de outra carteira.

O provedor valida a carteira da mensagem, suas cobranças/acordo e o condomínio real antes de selecionar a rota. A regra se aplica apenas a mensagens de flows de cobrança/acordo, preservando avisos internos e atendimento avulso. Sem rota, o transporte padrão continua; rota existente inativa, inválida ou com conta divergente bloqueia o envio, sem trocar silenciosamente para Camila.

O envelope SMTP e o cabeçalho From usam a conta Lidia; o cabeçalho Reply-To aponta explicitamente para a mesma caixa, inclusive com anexos. Cotas, janela noturna, aprovações, NDRs, anexos e proteção contra reenvio incerto permanecem no mecanismo existente. Envios históricos não são alterados nem reenviados.

Autenticação SMTP pode ser verificada sem destinatários e sem DATA. Isso comprova acesso à conta, mas não equivale a um teste de entrega ou de recebimento. A leitura do Outlook e o atendimento do piloto são etapas independentes da troca do remetente; a troca não habilita um monitor da caixa.

Validação: `scripts/validate-smtp-rota-condominio.ts`, `scripts/validate-email-controle.ts` e `scripts/validate-smtp-remetente.ts`.
