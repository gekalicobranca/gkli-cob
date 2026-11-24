# Estados de captação no Easy Maestro

Registro de 23/11/2026. Evidências de produção por consulta de metadados, sem arquivos ou dados de devedores.

| Achado | Evidência e impacto | Tratamento |
| --- | --- | --- |
| Fonte do Espelhar permanece aberta após falha da operação principal | No Hi View, o último log foi de login às 13h25 de 16/11. O espelhamento terminou às 13h52 e a fonte ficou em execução por dias, sem arquivo. O painel bloqueava a seleção. Também foram observados registros divergentes em Gabriele e L’Avance. | Reconciliar a fonte vinculada quando o espelhamento falha. Reexaminar a cada dez minutos as fontes ainda travadas ou com sinais recentes. Registrar log e auditoria. |
| O painel atribui ao Maestro um trabalho de outro módulo | A seleção de uma execução em aberto considera outras origens para evitar duas coletas da mesma receita. | Identificar a origem Espelhar. Enquanto uma fonte aberta tem operação principal em falha, indicar revisão e conservar o bloqueio até a reconciliação. |
| Uma tentativa avulsa antiga parece um alerta atual | No Living Wellness, a tentativa de 10/11 aparece junto do consolidado que cobriu os segmentos em 13/11. | Usar o término da tentativa para decidir se pertence ao histórico. Manter visíveis tentativas posteriores, execuções em curso e montagens em atenção. |
| As datas parecem contraditórias | Panorama, West Side e Santo Alberto mostram pedido em 10/11 e captação mensal concluída em 13/11. | Identificar separadamente a solicitação, a última captação concluída e a conclusão do consolidado. |

## Melhoria pendente

Quando uma fonte interrompida já tem arquivo, registro de importação ou montagem, a reconciliação automática deve preservar esse trabalho. Falta uma ação administrativa específica para conferir a evidência e decidir como concluir ou retomar o pedido com segurança. Para homologar essa melhoria, simular interrupção após o upload e após a importação e verificar que a retomada não repete a conversão nem a montagem.

## Verificação de 23/11

A reconciliação encerrou uma fonte do Hi View como precisa de intervenção, com um registro de auditoria. A consulta do Easy Maestro retornou disponível e liberada para a receita, com zero bloqueios gerais da BBZ. Na mesma consulta, três tentativas avulsas anteriores à cobertura do Living Wellness se qualificaram para o histórico. O teste em Chrome a 360 px confirmou histórico recolhido, preservação de uma tentativa posterior em revisão e seleção de uma receita disponível.

## Cádiz — coleta, importação e novas tentativas

Em 23/11 a primeira validação parou na proteção de mensagens em envio. Durante a segunda tentativa, a execução geral continuava em execução e o painel mostrava “Captando”, inclusive depois do upload. Também podia oferecer a validação da tentativa anterior. A captação terminou às 20h49 de Brasília, com 63 cobranças, alertas e montagem de Flow concluída.

O painel passa a mostrar “Importando” assim que há arquivo da tentativa ativa. Até então, deixa o link anterior fora da linha atual. Falhas por mensagens em envio têm orientação específica. O bloqueio financeiro da importação continua vigente. Como melhoria futura, avaliar a retomada da validação pelo mesmo arquivo após a confirmação dos envios, com autorização, auditoria e proteção contra duplicidade.

### Ocupação por condomínio

O painel e a RPC de confirmação bloqueavam a administradora inteira se houvesse uma captação ou montagem Easy em andamento. A seleção e a confirmação agora verificam os condomínios do pedido. Quando há várias receitas para o mesmo condomínio, basta uma ocupada para impedir duplicação naquele condomínio. O worker mantém o processamento em fila por administradora; aceitar um novo pedido para outro condomínio não inicia coletas concorrentes no portal.

### Tour de Lion e os recibos da Lello

Em 23/11 o relatório XLSX trazia 90 lançamentos. A chave gerada a partir do condomínio, da unidade e do vencimento diferia dos números do portal. Uma cota ordinária e uma contribuição de 13º salário compartilhavam a mesma chave da planilha.

Na confirmação do Maestro, identificar o recibo numérico antes de calcular quais cobranças podem ser substituídas. Conferir carteira, condomínio, bloco, unidade, vencimento e principal e exigir a chave anterior registrada ou a origem de Espelhamento Lello do mesmo código de condomínio. A prévia mantém a chave original e o número reconhecido. Impedir a confirmação quando duas linhas disputam o mesmo recibo ou a identificação é ambígua. A rotina transacional continua aplicando suas proteções de pagamento, acordos e estado judicial. A validação da mudança no Tour de Lion consultou a base somente para leitura. O reprocessamento da captação em produção é uma etapa separada.
