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
