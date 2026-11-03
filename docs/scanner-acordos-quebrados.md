# Conferência especial de acordos quebrados ou rompidos

Instrução expressa do usuário de 03/11/2026, incorporada ao Scanner. O banco atual e as evidências da administradora prevalecem sobre levantamentos anteriores.

## Regra

Parcela atrasada permanece vencida. Atraso, independentemente dos dias, não autoriza quebrar o acordo. Quebra depende de confirmação da administradora e conciliação de pagamentos, saldo residual e cotas abrangidas. Não converter em lote os antigos quebrados para outro status.

## Conferência por acordo

1. Confirmar condomínio, unidade, bloco e número do acordo ou processo administrativo. Diferenciar o identificador administrativo do CNJ; nunca homologar vínculo só pela unidade, competência ou valor.
2. Conferir situação atual: vigente com atraso, quitado, renegociado, cancelado ou efetivamente quebrado.
3. Conferir cronograma completo, valores, vencimentos, pagamentos efetivos e reemissões. Distinguir boletos das parcelas de recibos das cotas originais.
4. Identificar cotas de origem por competência, vencimento, recibo e valor. Candidatas por período não são vínculos confirmados.
5. Documentar aproveitamento dos pagamentos: abatimentos por cota, encargos, descontos, honorários e saldo residual informado pela administradora. Não ratear pagamentos, restaurar valores integrais após pagamentos parciais ou calcular saldo definitivo sem respaldo da administradora.
6. Registrar fonte, data da consulta, documento/relatório e limites de cada conclusão. Não presumir pagamento por vencimento, sequência de parcelas, ausência de débito ou parcelas posteriores pagas. Datas estimadas de importações históricas não viram datas efetivas confirmadas.

## Tratamento

- Vigente com atraso comprovado: propor corrigir a quebra indevida e manter parcelas não pagas vencidas. Efetivar somente com identidade exata e evidência documental; preservar bloqueios e registrar auditoria. O relatório inicial não altera status.
- Quebra confirmada com ajuste financeiro pendente: registrar o que falta, sem concluir a quebra ou liberar cotas.
- Quebra e ajuste financeiro confirmados: apresentar composição de pagamentos e saldo por cota para aprovação humana antes de efetivar quebra ou retomar cobranças.
- Quitação, renegociação ou cancelamento: registrar evidência e encaminhar ao procedimento de conciliação correspondente, preservando histórico e revisão judicial obrigatória.
- Informação insuficiente ou divergente: manter pendente, explicando os documentos e identificadores faltantes.

Não criar cobranças ausentes, duplicar débitos, emitir boletos, enviar mensagens nem ativar flows durante esta conferência. Preservar bloqueios até a validação do saldo. Os relatórios especiais desta frente são arquivos de revisão; não autorizam o envio automático do seu conteúdo. A rotina preexistente de relatórios de outras conferências não é alterada.

## Piqueri excluído

Excluir integralmente `29f34694-09fb-4cfa-8fb6-c613a30c4813` (Condomínio Residencial Plano & Estação Piqueri I), inclusive qualquer referência histórica com nome Piqueri. Seus acordos, parcelas e cotas foram excluídos por orientação expressa do usuário. Não reimportar ou recriar registros pelos arquivos de apoio, fontes de portal, reprocessamentos ou este levantamento.

## Execução e entrega

Consultas aos portais somente entre 00h30 e 05h25 de São Paulo, em sequência, com reservas e travas compartilhadas, intervalo global mínimo de quinze minutos, rodízio e até vinte unidades existentes por lote. Reaproveitar os acessos próprios das receitas; não ativar acessos pendentes ou adaptadores não validados. Não abrir relatórios de inadimplência ou executar captação. Falhas conservam cursor e checkpoints. Casos fora da cobertura atual ficam explicitamente pendentes de acesso/documentos, sem presumir confirmação.

Entregar uma relação por acordo contendo situação no app e na administradora, identificadores separados, total contratado, pagamentos confirmados com fonte, parcelas vencidas, cronograma completo, cotas explicitamente abrangidas, saldo residual confirmado, divergências e providência proposta. Separar conciliados, pendentes de documentos e dependentes de aprovação humana; informar alterações efetivamente realizadas. Valores registrados no app, valores nominais de parcelas marcadas pagas e pagamentos comprovados no portal são informações diferentes.

O levantamento inicial somente lê o app: `scripts/scanner/revisao-quebrados.mjs`. Não chama portais, IA, RPCs financeiras, envio de mensagens ou fluxos. Seus valores ausentes permanecem nulos; não produz saldo residual nem homologação de vínculo. Evidências parciais do scanner são anexadas como referências, sem promover o caso a conciliado. Esta restrição inicial é intencional até obter o dossiê completo da administradora.

Arquivos anteriores, apenas como apoio: `C:\tmp\acordos-quebrados-revisao-20261103.json`, `C:\tmp\acordos-99-conferencia-cotas-20261103.json`, `C:\tmp\acordos-99-conferencia-cotas-20261103.txt`. O gerador não importa esses arquivos: apura novamente as cotas e os períodos explícitos no banco.

## Posição inicial atualizada

Consulta de 03/11/2026: 127 acordos quebrados, 47 com vínculo explícito de cotas e 80 sem vínculo. Nenhum com `quebra_confirmacao` preenchida. Piqueri inativo, sem acordos ou cobranças. As contagens antigas 146/99 estão superadas. A confirmação documental de novas quebras já é exigida no banco pelo gatilho `acordo_exigir_confirmacao_quebra`; esta frente preserva essa proteção e as alterações em desenvolvimento em outros trabalhos.

O relatório gerado separa as categorias de cotas dos oitenta casos e explicita as limitações do cadastro. Conferência efetiva nos portais, reclassificação de acordo e validação de saldo não foram realizadas pelo levantamento inicial.

Reapuração dos oitenta sem vínculo: quarenta com candidatas por período (sem homologação), dez com cotas fora do período, cinco sem período inequívoco e vinte e cinco sem cotas cadastradas. Entre os quarenta e sete com referências explícitas, quarenta e seis passaram apenas na conferência de escopo interno (mesma unidade, condomínio e carteira). O acordo `f0ca9f3c-1a0d-4431-9da7-86751e33d8bc`, Square Guarulhos/unidade 184, aponta para a cobrança `5e3dd8d0-be54-41c6-a4d8-fe52fb129d1c`, cuja unidade no banco é outra: divergência de identidade para revisão, sem correção ou liberação automática.

Entrega inicial: `C:\tmp\scanner-acordos-quebrados-20261103-atualizado.html` e versão JSON no mesmo caminho/base. Todos os 127 permanecem pendentes do dossiê necessário; zero conciliados nesta conferência, zero casos com dossiê completo encaminhados para aprovação e zero alterações financeiras/operacionais. Doze testes específicos e da interpretação assistida aprovados; TypeScript sem erros. As novas instruções também foram incluídas no prompt efetivamente usado pela interpretação do scanner, preservando o esquema de sugestões e a ausência de autorização de escrita. A consulta dos portais e a conciliação completa desta frente continuam pendentes; o exportador não as executa nem agenda.
