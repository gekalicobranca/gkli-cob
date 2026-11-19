# Remetente dos flows do Oásis

## Ampliação ao Cádiz em 20/10/2026

Em 21/10/2026 o operador autorizou ajustar o escopo à carteira atual do Cádiz: `36b6c087-56d2-4297-be63-6dcbe02a9f00` (Escritório Genske Adv). Oásis permanece em `06827218-e2b1-4267-ad8f-81a0ab222cad`. Os perfis validam os pares exatos e intersectam as carteiras permitidas do usuário; isso não libera outros condomínios dessas carteiras. O monitor foi atualizado sem mudar o horário ou autorizar envios. Não há alteração de regras financeiras ou carteiras de condomínios neste ajuste.

Pedido de Katia (unidade 1604, contato `80novaeskatia@gmail.com`), recebido em 20/10/2026 às 10h31, registrado no caso `f6c79d17-3d59-522e-acd5-c8d57d02bb00` para atuação humana. Solicita boletos de acordo existente com cinco parcelas, inclusive uma indicada para 20/10; não é novo aceite nem proposta de cinco parcelas. Conferir vínculo com o responsável cadastrado, conciliar na Manager e obter boletos atualizados. Nenhum acordo, cobrança, boleto ou mensagem de saída é criado por esse registro.

Por autorização do operador, o CONDOMÍNIO CÁDIZ JARDIM PRUDÊNCIA (`47926d7c-030b-4469-8713-b23eda558a56`) também usa a conta Lidia como remetente e Reply-To nos próximos envios de flows, pela mesma rota administrativa. Os demais condomínios sem rota específica continuam com o SMTP padrão da carteira. Mensagens históricas não são alteradas nem reenviadas; esta configuração não antecipa a agenda nem dispensa a janela normal.

O monitor existente da Lidia acompanha agora Oásis e Cádiz na mesma caixa, de segunda a sexta às 09h de Brasília, neste chat. No Cádiz, processar novos retornos desde 20/10/2026 e acompanhar pendências ativas, preservando atendimentos humanos de conferência. Respostas antigas destinadas à caixa Camila não são presumidas lidas na caixa Lidia. Registrar casos como `lidia_atendimento` pelos serviços compartilhados com `agenteId: 'lidia'`; o CLI JSON exclusivo da Keila não pode ser usado com conta forjada.

Manager é a administradora do Cádiz e a régua começa em 45 dias. Em 20/10/2026 o operador confirmou e foram cadastradas as regras do Cádiz: despesas de 10% à vista e 20% no parcelado, em até três parcelas. Quantidades maiores exigem nova orientação. As regras do Oásis ainda aguardam confirmação e não herdam as do Cádiz. O monitor somente registra retornos e prepara rascunhos para revisão; não envia, aprova ou libera mensagens, não formaliza acordos e não cria flows. O cadastro e as regras do Oásis permanecem independentes.

Autorização do operador em 19/10/2026: os e-mails dos flows do Oásis usam `lidia@genskeadvogados.com.br` como remetente e endereço de resposta. O SMTP padrão da carteira Genske Advogados permanece com Camila para os demais condomínios. As regras de acordo do Oásis continuam aguardando confirmação; esta configuração não as altera.

A tabela administrativa `integracoes_smtp_rotas_condominio` vincula o condomínio à configuração SMTP já cadastrada da Lidia, sem copiar senhas e sem mover o condomínio de carteira. A tabela é exclusiva do servidor, com RLS e permissões revogadas para clientes anônimos e autenticados. Somente uma alteração administrativa confiável pode cadastrar uma rota; o payload de uma mensagem nunca escolhe uma credencial de outra carteira.

O provedor valida a carteira da mensagem, suas cobranças/acordo e o condomínio real antes de selecionar a rota. A regra se aplica apenas a mensagens de flows de cobrança/acordo, preservando avisos internos e atendimento avulso. Sem rota, o transporte padrão continua; rota existente inativa, inválida ou com conta divergente bloqueia o envio, sem trocar silenciosamente para Camila.

O envelope SMTP e o cabeçalho From usam a conta Lidia; o cabeçalho Reply-To aponta explicitamente para a mesma caixa, inclusive com anexos. Cotas, janela noturna, aprovações, NDRs, anexos e proteção contra reenvio incerto permanecem no mecanismo existente. Envios históricos não são alterados nem reenviados.

Autenticação SMTP pode ser verificada sem destinatários e sem DATA. Isso comprova acesso à conta, mas não equivale a um teste de entrega ou de recebimento. A leitura do Outlook e o atendimento do piloto são etapas independentes da troca do remetente; a troca não habilita um monitor da caixa.

Validação: `scripts/validate-smtp-rota-condominio.ts`, `scripts/validate-email-controle.ts` e `scripts/validate-smtp-remetente.ts`.

## Teste pontual fora da janela

Em 19/10/2026 o operador autorizou expressamente o disparo imediato dos sete e-mails já agendados do flow `0dcffd39-e00d-480c-97e8-a4b8ef388d00`. A migração `20261019205138_email_excecao_teste_restrita.sql` adiciona autorizações administrativas por mensagem, condomínio, carteira, flow e assinatura do destinatário/conteúdo. Elas expiram em até uma hora e são revogadas após cada tentativa pelo executor pontual. Alterar conteúdo, destinatário ou vínculos invalida a autorização. Clientes anônimos e autenticados não podem consultar nem conceder exceções.

A exceção dispensa somente janela noturna e intervalo entre disparos das mensagens expressamente selecionadas. Cotas diárias, transporte, aprovação, elegibilidade, bloqueios de endereço, cobranças arquivadas e proteção contra envio duplicado ou incerto continuam no provedor original. O cron e o filtro diurno do dispatcher não foram alterados; o teste usa o provedor SMTP habitual diretamente, com registro de tentativa e atualização do flow. Qualquer nova execução exige nova autorização do operador e nova concessão administrativa; não há reenvio automático pelo teste.

Validação adicional: `scripts/validate-email-excecao-teste.ts`. O aviso informativo de RLS sem políticas é intencional nesta tabela exclusiva do servidor: todos os privilégios de clientes foram revogados.
