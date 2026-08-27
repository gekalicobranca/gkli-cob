# Manual operacional - GKLI Cobrança

Data desta versão: 2026-08-19

Este manual orienta o uso operacional do GKLI Cobrança. O foco é o trabalho diário do operador: iniciar pelo Inbox, consultar ou ajustar cadastros, executar cobranças e acordos e preparar casos para encaminhamento jurídico.

Não fazem parte deste manual: integrações externas futuras e configurações técnicas de infraestrutura.

## 1. Visão geral

O app está organizado para que o operador crie um hábito simples:

1. Começar o dia pelo Inbox operacional.
2. Abrir os itens priorizados que precisam de ação.
3. Usar as listas de Operação para filtrar, ordenar e resolver casos.
4. Usar Cadastros somente quando a base precisar de ajuste ou enriquecimento.
5. Conferir se os botões acionados entraram em processamento antes de repetir uma ação.

Áreas deste manual:

- Inbox operacional: fila única do dia.
- Operação: cobranças, acordos, parcelas de acordo e pendências.
- Cadastros: condomínios, unidades, responsáveis e administradoras.
- Pré-Jurídico: preparação documental, réguas exclusivas, lotes e monitoramento até a judicialização.

## 2. Padrão comum das telas

As principais listas seguem o mesmo modelo de uso.

### 2.1 Busca

Use a busca livre para encontrar rapidamente o item por termos conhecidos, como:

- condomínio;
- unidade;
- bloco;
- responsável;
- CPF/CNPJ;
- telefone;
- e-mail;
- status;
- número ou referência interna, quando a tela permitir.

### 2.2 Filtros

Os filtros variam por tela, mas seguem a mesma lógica:

- Data inicial e data final quando houver vencimento, criação ou data de acordo.
- Status quando o fluxo possuir situações operacionais.
- Tipo quando existir diferença real de tratamento.
- Condomínio e carteira nas bases maiores.
- Contato para identificar cadastros incompletos.

Quando uma lista parecer vazia, limpe os filtros antes de concluir que não há registros.

### 2.3 Ordenação

Use "Ordenar por" para mudar a leitura da lista sem exportar dados. Exemplos comuns:

- vencimento mais antigo;
- data mais recente;
- maior valor;
- condomínio;
- unidade;
- responsável;
- status.

Para o trabalho operacional, a ordenação mais segura costuma ser por vencimento antigo, prazo ou prioridade.

### 2.4 Botões e processamento

Os botões de ação devem dar retorno visual quando clicados.

Regras de uso:

- Clique uma vez e aguarde o estado de processamento.
- Não repita a ação se o botão indicar que está salvando, confirmando, resolvendo ou solicitando.
- Se a tela mostrar erro de módulo, use "Tentar novamente". Se persistir, informe o código exibido ao suporte.
- Em ações financeiras ou de status, confira se a lista ou o detalhe refletiu a alteração antes de seguir para outro item.

## 3. Rotina recomendada do operador

### 3.1 Início do dia

1. Acesse `/app/inbox`.
2. Comece pela fila "Hoje".
3. Se houver itens em "Críticos", trate-os antes dos demais.
4. Abra cada item pela ação indicada.
5. Ao terminar uma ação, volte para o Inbox ou para a lista relacionada.

### 3.2 Durante a operação

Use as listas quando precisar de uma visão mais ampla:

- `/app/cobrancas` para encontrar e priorizar débitos.
- `/app/acordos` para acompanhar acordos por condomínio/unidade.
- `/app/acordos/fila` para trabalhar parcelas de acordo.
- `/app/pendencias` para resolver travas manuais.

### 3.3 Fechamento do período de trabalho

Antes de encerrar:

- confira pendências abertas ou em tratamento;
- verifique parcelas vencidas ou próximas do vencimento;
- confirme se pagamentos marcados como pagos foram atualizados;
- registre ajustes cadastrais que impedem a próxima ação.

## 4. Inbox operacional

Rota: `/app/inbox`

Objetivo: concentrar o que precisa virar ação agora, sem obrigar o operador a entrar em várias listas.

### 4.1 Indicadores

O topo do Inbox resume:

- Fila do dia: quantidade de ações recomendadas.
- Críticos: itens de risco alto.
- Carteira acionável: valor associado a itens com ação sugerida.
- Conversão: potencial de negociações quentes.

### 4.2 Filas

Filas disponíveis:

- Hoje: melhor ponto de partida.
- Críticos: risco alto e ação imediata.
- Acordos em risco: parcelas, atrasos e acordos que precisam de proteção.
- Negociações: casos com maior chance de acordo.
- Sem retorno: itens sem movimentação recente.

### 4.3 Como usar

1. Escolha a fila.
2. Leia o contexto do item.
3. Clique na ação ou abra o registro.
4. Execute a ação manual no workspace, acordo ou pendência.
5. Retorne para o Inbox para seguir a próxima prioridade.

### 4.4 Cuidados

- O Inbox prioriza; ele não substitui as listas.
- Se precisar procurar algo específico, use Cobranças, Acordos ou Pendências.
- Se o item abrir uma cobrança, o destino natural é o workspace operacional.

## 5. Operação - Cobranças

Rota principal: `/app/cobrancas`

Rotas relacionadas:

- Detalhe/lista operacional: `/app/cobrancas/[id]`
- Workspace operacional: `/app/workspace/[id]`
- Nova cobrança: `/app/cobrancas/nova`

Objetivo: consultar e executar a cobrança extrajudicial.

### 5.1 Indicadores

A tela resume:

- Em aberto.
- Novas.
- Ativas.
- Em negociação.

### 5.2 Filtros principais

Use:

- Busca: condomínio, unidade, bloco, responsável, documento, telefone, e-mail ou referência.
- Status: novo, em cobrança ativa, em negociação, acordo firmado, acordo efetivado, suspenso.
- Vencimento de/até.
- Judicialização da unidade.
- Ordenar por: vencimento, valor, condomínio, unidade, responsável ou status.

### 5.3 Regra extrajudicial

Como o foco da operação é extrajudicial, unidades judicializadas não aparecem por padrão.

Para incluir judicializadas:

1. Use o filtro de judicialização.
2. Selecione a opção correspondente.
3. Aplique o filtro.

Evite tratar judicializadas como cobrança comum sem confirmar o contexto.

### 5.4 Ações esperadas

Na lista, o operador deve conseguir:

- abrir a cobrança;
- acessar o workspace;
- alterar status em lote quando a tela permitir;
- iniciar fluxo de acordo a partir de uma cobrança/unidade elegível.

### 5.5 Quando usar

Use Cobranças quando:

- precisar encontrar um débito específico;
- quiser priorizar por vencimento ou valor;
- precisar revisar status de cobrança;
- for iniciar acordo a partir de uma cobrança negociada.

## 6. Operação - Acordos

Rota principal: `/app/acordos`

Rotas relacionadas:

- Detalhe do acordo: `/app/acordos/[id]`
- Selecionar cobranças para acordo: `/app/acordos/selecionar`
- Fila de parcelas: `/app/acordos/fila`
- Rompimentos: `/app/acordos/rompimentos`

Objetivo: acompanhar acordos ativos, em atraso, quitados, cancelados ou rompidos.

### 6.1 Indicadores

A tela resume:

- Valor ativo.
- Ativos.
- Em atraso.
- Rompidos.

### 6.2 Filtros principais

Use:

- Busca: condomínio, unidade, responsável, processo, status ou tipo.
- Status.
- Tipo: extrajudicial ou judicial.
- Data de início e data de fim.
- Ordenar por: condomínio, unidade, responsável, status, data ou valor.

### 6.3 Criação de acordo

A criação de acordo deve partir da cobrança/unidade selecionada. Isso evita carregar uma lista enorme de cobranças dentro do formulário de novo acordo.

Fluxo recomendado:

1. Abra a cobrança.
2. Inicie o fluxo de acordo.
3. Em `/app/acordos/selecionar`, selecione os débitos da unidade que entram no acordo.
4. Use "Selecionar todos" quando todos os itens elegíveis fizerem parte do acordo.
5. Itens bloqueados permanecem travados.
6. Siga para a simulação/criação do acordo.

### 6.4 Aceite do devedor

Para efetivação do acordo, o aceite do devedor é mandatório.

Enquanto a automação definitiva não estiver fechada, o acompanhamento manual deve garantir que:

- o termo correto foi gerado;
- o link de aceite está válido;
- o devedor confirmou o aceite;
- o registro do aceite refletiu no status do acordo;
- pendências de boleto ou reemissão foram geradas quando aplicável.

### 6.5 Desfazer/cancelar acordo sem aceite

Se o devedor não confirmar o aceite, o acordo não deve seguir como efetivado.

Use a ação disponível no detalhe do acordo ou na central de acionamentos quando houver pendência relacionada. Antes de desfazer, confira:

- se realmente não houve aceite;
- se boletos não foram enviados ou confirmados indevidamente;
- se há pendência operacional aberta vinculada ao acordo.

## 7. Operação - Parcelas de acordos

Rota: `/app/acordos/fila`

Objetivo: acompanhar vencimentos, confirmar pagamentos e solicitar reemissões sem abrir cada acordo.

### 7.1 Indicadores

A fila resume:

- Parcelas.
- Abertas.
- Atrasadas.
- Pagas.

### 7.2 Filtros principais

Use:

- Busca: unidade, responsável ou parcela.
- Condomínio.
- Status: aberta, vencida, paga ou cancelada.
- Tipo: entrada ou parcela.
- Vencimento de/até.
- Ordenar por: vencimento antigo, vencimento recente, condomínio, unidade, responsável, status ou valor.

Por padrão, trabalhe pelo vencimento mais antigo.

### 7.3 Ação: Pago

Use "Pago" quando houver confirmação confiável de pagamento.

Depois de clicar:

- aguarde "Confirmando...";
- confira se a parcela saiu da situação aberta/vencida;
- confira se o status do acordo foi recalculado quando aplicável.

### 7.4 Ação: Reemitir

Use "Reemitir" quando uma parcela vencida precisar ser reemitida e o condomínio permitir esse procedimento.

O botão pode ficar indisponível quando:

- o condomínio não permite reemissão;
- a parcela não está vencida;
- a parcela está fora da janela de dias permitida pelo condomínio;
- a parcela já foi paga ou cancelada.

Quando a reemissão é solicitada, o esperado é gerar pendência operacional para ajuste/acionamento. Se a reemissão alterar o valor, o acordo deve ser reaberto para ajuste das parcelas e envio de novo resumo ao devedor.

### 7.5 O que não fazer pela fila

Não marque rompimento manualmente a partir da fila. Rompimento deve resultar de regra operacional, atraso persistente ou rotina controlada, não de um clique simples do operador.

## 8. Operação - Pendências

Rota: `/app/pendencias`

Objetivo: centralizar travas manuais que impedem o fluxo de seguir.

### 8.1 Exemplos de pendências

- Pedido de planilha de débitos.
- Pedido de boleto de acordo.
- Registro de aceite ou acionamento manual.
- Reemissão de parcela.
- Ajuste de valores de acordo.
- Confirmação de pagamento.

### 8.2 Indicadores e prioridade

Observe:

- abertas;
- em tratamento;
- atrasadas;
- críticas.

Prioridades comuns:

- Baixa.
- Normal.
- Alta.
- Crítica.

### 8.3 Filtros principais

Use:

- Busca.
- Status.
- Prioridade.
- Origem.
- Tipo.
- Data de início/fim.
- Ordenação por prazo, criação, prioridade, status, origem ou tipo.

### 8.4 Ações

Ações esperadas:

- Tratar: indica que alguém assumiu a pendência.
- Resolver: encerra a pendência e deve refletir no fluxo de origem quando houver vínculo.
- Reabrir: retorna uma pendência resolvida/cancelada para tratamento.

Antes de resolver, confira se o efeito operacional realmente aconteceu. Exemplo: não resolver pedido de boleto se o boleto ainda não foi enviado ou registrado.

## 9. Cadastros - Condomínios

Rota principal: `/app/condominios`

Rotas relacionadas:

- Novo condomínio: `/app/condominios/novo`
- Detalhe/edição: `/app/condominios/[id]`

Objetivo: manter os parâmetros que orientam cobrança, acordo e reemissão.

### 9.1 Indicadores

A tela resume:

- Ativos.
- Régua média.
- Cota média.

### 9.2 Filtros principais

Use:

- Busca por nome, nome operacional, CNPJ ou administradora.
- Carteira.
- Administradora.
- Status.
- Ordenação por nome, administradora, status, carteira, régua ou cota.

### 9.3 Campos/regras relevantes

No cadastro/detalhe, confira especialmente:

- carteira;
- administradora;
- status;
- vencimento da cota;
- início da cobrança após X dias;
- parcelas permitidas sem aprovação do síndico;
- dias para reemissão de parcela de acordo em atraso.

### 9.4 Impacto operacional

Alterações no condomínio podem afetar:

- quando uma cobrança passa a ser acionável;
- se o acordo precisa de aprovação;
- se parcela vencida pode ser reemitida;
- qual administradora será acionada para planilha ou boleto.

## 10. Cadastros - Unidades

Rota principal: `/app/unidades`

Rotas relacionadas:

- Nova unidade: `/app/unidades/nova`
- Detalhe/edição: `/app/unidades/[id]`

Objetivo: manter a base de unidades, responsáveis e contatos usados pela cobrança.

### 10.1 Indicadores

A tela resume:

- Ativas.
- Sem telefone.
- Sem e-mail.

### 10.2 Filtros principais

Use:

- Busca por unidade, condomínio, bloco, responsável, CPF/CNPJ, telefone ou e-mail.
- Carteira.
- Condomínio.
- Status.
- Contato: sem telefone, sem e-mail ou cadastro incompleto.
- Ordenação por condomínio, unidade, responsável, status ou carteira.

### 10.3 Uso operacional

Use Unidades quando:

- houver divergência de contato;
- o responsável estiver ausente ou incompleto;
- a unidade estiver com status incorreto;
- for preciso verificar se a unidade está ativa/suspensa/inativa;
- a judicialização da unidade estiver impactando a cobrança extrajudicial.

### 10.4 Ações em lote

Quando selecionar várias unidades, confira a seleção antes de aplicar status em lote. Alterações de unidade podem refletir na elegibilidade de cobranças e acordos.

## 11. Cadastros - Responsáveis

Rota principal: `/app/responsaveis`

Rotas relacionadas:

- Novo responsável: `/app/responsaveis/novo`
- Detalhe/edição: `/app/responsaveis/[id]`

Objetivo: manter cadastro próprio dos responsáveis por unidade, sem expor dados pessoais completos diretamente na lista.

### 11.1 Indicadores

A tela resume:

- Ativos.
- Proprietários.
- Inquilinos.
- Incompletos.

### 11.2 Filtros principais

Use:

- Busca por condomínio, unidade, responsável ou contato.
- Carteira.
- Condomínio.
- Status: ativos ou inativos.
- Contato: sem telefone, sem e-mail ou cadastro incompleto.
- Tipo: proprietário, inquilino ou não informado.
- Ordenação por condomínio, unidade, responsável, tipo, status ou carteira.

### 11.3 Tipo de responsável

O tipo ajuda a entender quem responde pelo acordo e pela cobrança:

- Proprietário: dono da unidade.
- Inquilino: ocupante/responsável contratual.
- Não informado: usado quando a base ainda não permite classificar.

Sempre que possível, atualize o tipo. Essa informação aparece no contexto do acordo quando o responsável estiver vinculado.

### 11.4 Dados pessoais

Dados como documento, telefone, e-mail e observações devem ser consultados e editados no cadastro individual, não na lista. A lista serve para localizar e priorizar ajustes.

## 12. Cadastros - Administradoras

Rota principal: `/app/administradoras`

Rotas relacionadas:

- Nova administradora: `/app/administradoras/nova`
- Detalhe/edição: `/app/administradoras/[id]`

Objetivo: manter administradoras e contatos externos que destravam planilhas, boletos e registros de acordo.

### 12.1 Indicadores

A tela resume:

- Total.
- Ativas.
- Hub externo ADM.

### 12.2 Filtros principais

Use:

- Busca por nome, CNPJ ou e-mail.
- Status.
- Acesso acordos: liberado ou sem acesso.
- Ordenação por nome, status, acesso acordos ou contato.

### 12.3 Flag "acesso para gerar acordo"

Use esta flag para indicar se a administradora possui acesso/condição operacional para gerar acordo.

Impacto esperado:

- administradoras sem acesso podem exigir fluxo manual ou pendência antes de seguir;
- administradoras com acesso liberado podem destravar criação/andamento de acordo conforme regra do condomínio.

### 12.4 E-mail geral

O e-mail geral da administradora não deve bloquear o cadastro. Quando não houver e-mail geral:

- cadastre a administradora mesmo assim;
- preencha contatos específicos quando disponíveis;
- marque quais contatos recebem planilha, boleto ou cobrança.

## 13. Pré-Jurídico

O módulo Pré-Jurídico organiza a passagem entre a cobrança extrajudicial e a preparação jurídica. Ele fica no menu lateral, abaixo de Comunicação e antes de Gestão.

A especificação funcional completa fica em `docs/pre-juridico-especificacao-funcional.md`. O resumo de funcionalidades fica em `docs/pre-juridico-funcionalidades.md`.

### 13.1 Navegação atual

O menu Pré-Jurídico possui:

- Painel Pré: cobranças elegíveis e encaminhamento.
- Flow: criação de lote + régua e monitoramento dos envios.
- Processamento: laudo, certidão, procuração, confirmação jurídica e distribuição.
- Lotes: consulta de lotes pré-jurídicos.
- Régua: configuração da régua pré-jurídica por carteira.

Não há chamada operacional separada para Monitor de lote ou Monitor de Flow. O acompanhamento dos disparos fica na seção `Flows` da tela Flow.

### 13.2 Fluxo recomendado

1. Em Painel Pré, filtre e encaminhe cobranças elegíveis.
2. Em Processamento, gere laudo para iniciar o caso da unidade.
3. Confirme a propriedade pela certidão.
4. Gere a procuração.
5. Em Flow, selecione as procurações geradas.
6. Agrupe por carteira, escolha a régua e crie o Flow.
7. No próprio Flow, envie e acompanhe agenda, enviados, falhas e reenvios.
8. Quando a procuração voltar assinada, marque como assinada no Processamento.
9. Em Confirmar jurídico, marque procuração assinada, registro recebido e laudo enviado.
10. Na Distribuição, informe o CNPJ para marcar a unidade com ação judicial.

### 13.3 Pontos de atenção

- A régua pré-jurídica é por carteira, não por condomínio.
- A procuração gerada permanece no processamento como `gerada` e entra automaticamente na disponibilidade do Flow.
- Lote contém conteúdo e mensagens.
- Régua contém agenda, frequência e template.
- Flow é a execução monitorada de lote + régua.
- O envio acontece pelo dispatcher automático, respeitando a agenda da régua.
- Falhas aparecem na fila de envio do Flow, com motivo e opção de reenviar.
- A distribuição exige CNPJ; ao confirmar, a unidade é marcada com ação judicial e as cobranças abertas são judicializadas.

## 14. Fluxos práticos

### 14.1 Cobrar caso priorizado pelo Inbox

1. Abra `/app/inbox`.
2. Escolha "Hoje" ou "Críticos".
3. Abra o item indicado.
4. No workspace, execute a ação necessária.
5. Aguarde o processamento do botão.
6. Confirme se status, pendência ou timeline foram atualizados.

### 14.2 Criar acordo a partir de cobrança

1. Localize a cobrança em `/app/cobrancas`.
2. Abra a cobrança/workspace.
3. Inicie o fluxo de acordo.
4. Selecione os débitos elegíveis em `/app/acordos/selecionar`.
5. Confira bloqueios por planilha ou judicialização.
6. Simule e crie o acordo.
7. Acompanhe aceite, boleto e parcelas.

### 14.3 Confirmar pagamento de parcela

1. Acesse `/app/acordos/fila`.
2. Filtre por condomínio, vencimento ou status.
3. Confira acordo, unidade, parcela e valor.
4. Clique em "Pago".
5. Aguarde a confirmação.
6. Verifique se a parcela e o acordo foram atualizados.

### 14.4 Solicitar reemissão de parcela

1. Acesse `/app/acordos/fila`.
2. Filtre parcelas vencidas.
3. Confirme se o botão "Reemitir" está habilitado.
4. Clique em "Reemitir".
5. Acompanhe a pendência gerada.
6. Se o valor mudar, ajuste o acordo e envie novo resumo ao devedor.

### 14.5 Tratar pendência operacional

1. Acesse `/app/pendencias`.
2. Filtre por status aberta/em tratamento ou prioridade.
3. Clique em "Tratar" se for assumir.
4. Execute a ação fora ou dentro do app.
5. Clique em "Resolver" somente depois do efeito confirmado.

### 14.6 Ajustar responsável de unidade

1. Acesse `/app/responsaveis`.
2. Busque por condomínio, unidade ou nome.
3. Abra o cadastro individual.
4. Atualize o tipo: proprietário, inquilino ou não informado.
5. Complete telefone, e-mail e documento quando disponíveis.
6. Salve e confira se o cadastro saiu de incompleto quando aplicável.

## 15. Cuidados e exceções

### 15.1 Judicialização

O app prioriza cobrança extrajudicial. Judicializadas devem ficar fora do fluxo comum, salvo quando o operador solicitar explicitamente.

### 15.2 Duplicidade de clique

Se um botão estiver processando, aguarde. Repetir clique em ação sensível pode gerar duplicidade de pendência, status ou registro operacional.

### 15.3 Dados incompletos

Nem todo cadastro incompleto impede a operação. Priorize completar o que afeta contato, acordo e boleto:

- responsável;
- telefone;
- e-mail;
- tipo do responsável;
- administradora;
- permissão de reemissão;
- acesso para gerar acordo.

### 15.4 Pendência resolvida

Resolver pendência deve significar que o bloqueio foi removido de verdade. Não use "Resolver" apenas para limpar a fila.

### 15.5 Reemissão com valor alterado

Quando a reemissão muda o valor, o fluxo precisa voltar para ajuste do acordo:

1. reabrir/ajustar o acordo;
2. recalcular parcelas;
3. enviar resumo da alteração ao devedor;
4. solicitar ou reemitir boleto;
5. registrar envio/retorno.

## 16. Checklist de implantação assistida

Use este checklist para validar a etapa manual:

- O operador inicia o dia pelo Inbox.
- O operador consegue abrir cada item priorizado.
- Cobranças filtram por busca, status, vencimento e judicialização.
- Acordos filtram por busca, status, tipo, data e valor.
- Parcelas de acordo aparecem por vencimento mais antigo.
- Pagamento de parcela pode ser confirmado pela fila.
- Pedido de reemissão gera acompanhamento manual.
- Pendências podem ser tratadas, resolvidas e reabertas.
- Condomínios possuem regra de reemissão e parâmetros de acordo.
- Unidades possuem status e contatos revisáveis.
- Responsáveis possuem tipo proprietário/inquilino/não informado.
- Administradoras possuem flag de acesso para gerar acordo.
- Carteiras habilitadas exibem casos elegíveis no Painel Pré.
- Cobranças do Painel Pré aparecem agrupadas por condomínio.
- Casos do Processamento aparecem por unidade, com cobranças agrupadas.
- Laudo e procuração registram suas etapas.
- Réguas pré-jurídicas estão separadas das réguas de cobrança e acordo.
- A régua pré-jurídica é configurada por carteira.
- O Flow permite acompanhar agenda, enviados, falhas e reenvios.
- Botões exibem processamento perceptível.
- Erros de módulo mostram código para suporte.

## 17. Glossário rápido

- Inbox: fila priorizada do que precisa de ação agora.
- Workspace: tela de trabalho de uma cobrança.
- Pendência: trava operacional que exige ação manual.
- Reemissão: pedido de novo boleto/parcela, quando permitido.
- Judicializada: unidade fora do fluxo extrajudicial padrão.
- Responsável: pessoa ou empresa vinculada a uma unidade.
- Proprietário: responsável dono da unidade.
- Inquilino: responsável ocupante/contratual.
- Acesso acordos: permissão/condição da administradora para gerar acordo.
- Caso pré-jurídico: acompanhamento operacional de uma unidade encaminhada à preparação jurídica.
- Régua pré-jurídica: configuração por carteira que define agenda, frequência, canal e templates.
- Lote pré-jurídico: conjunto de conteúdo, itens e mensagens gerado para procurações selecionadas.
- Flow pré-jurídico: execução monitorada de lote + régua, com agenda, envios, falhas e reenvios.
- Judicializado: cobrança/unidade distribuída ao jurídico e retirada do fluxo extrajudicial.
