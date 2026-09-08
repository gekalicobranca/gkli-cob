# Nova visão do síndico — contrato inicial dos dados

Data: 07/09/2026. Inspeção do código, migrações e consulta de leitura ao banco. Captação integrada com cobertura limitada e explícita; demais indicadores em investigação.

## Regras implementadas

`features/sindico-v2/periodos.ts` centraliza competências fechadas e agrupamento anual. O dia 10 às 00h em America/Sao_Paulo encerra o ciclo anterior. Os intervalos são semiabertos: início incluído e fim excluído. O consolidado anual termina no último ciclo encerrado do ano escolhido.

Os limites são datas civis. Ao integrar campos `timestamptz`, converter cada limite para um instante no fuso America/Sao_Paulo, respeitando o fuso histórico; não usar UTC à meia-noite nem fixar deslocamento UTC-3 para todo o passado. Campos SQL `date` usam diretamente as datas civis. Filtros devem usar `>= início` e `< fim`, inclusive no anual.

`features/sindico-v2/queries.ts` valida sessão e papel em `profiles`, exige usuário do portal ativo e só lista vínculos ativos. A seleção explícita de condomínio não autorizado é recusada sem substituição silenciosa. Não há leitura de dados financeiros nesta primeira entrega.

## Indicadores e fontes candidatas

| Indicador | Definição e referência temporal | Fonte candidata | Anual e deduplicação | Limitação a resolver |
| --- | --- | --- | --- | --- |
| Captação | Débitos efetivamente confirmados no ciclo; referência da confirmação | `conversoes_relatorio`, confirmação em `app/api/conversao-relatorio/confirmar/route.ts` | Identificar execução confirmada e identidade do débito; não somar tentativas ou relatórios repetidos | `atualizado_em` é mutável; não é evidência suficiente de confirmação histórica imutável |
| Unidades captadas | Unidades com débito confirmado | Dados confirmados de captação e vínculos de unidade | IDs distintos no intervalo anual | Diferenciar linhas de preview, cobranças ignoradas e cobranças efetivamente criadas |
| Saldo em cobrança | Saldo das cobranças ainda em acompanhamento imediatamente antes do fim | `cobrancas`, `cobranca_parcelas`, eventos operacionais | Posição do último encerramento, sem somar saldos mensais | Valores/status atuais não bastam para reconstruir saldo passado; considerar pagamentos, substituições e vínculos a acordos |
| Faixas de atraso | Unidades e valores agrupados pelo atraso no fechamento | Vencimentos e saldos históricos de cobrança | Distribuição no último fechamento | Calcular atraso com a referência do ciclo, nunca com a data atual |
| Acordos celebrados e valor negociado | Acordos celebrados dentro do intervalo; condições na celebração | `acordos`, `acordos_revisoes`, histórico de formalização | IDs distintos; somar valores históricos da celebração | Revisões podem alterar `valor_acordado`; validar o marco de celebração antes de tratar `data_acordo` como evento definitivo |
| Recebimentos | Movimentações efetivamente pagas dentro do intervalo | `parcelas_acordo.data_pagamento`; verificar histórico financeiro e estornos | Somar movimentos únicos por identidade financeira | Não confundir `valor` previsto com valor recebido; verificar pagamentos parciais, estornos e alterações posteriores |
| Posição das parcelas | Parcelas e saldos no fechamento | `parcelas_acordo`, revisões e pagamentos | Posição no último fechamento | `acordos_parcelas` é legado e não será fonte; revisão altera valor e vencimento |
| Aprovações | Termos que exigiam resposta no encerramento | `acordos_termos`, histórico de status e expiração | Pendências no último fechamento, com IDs distintos | Criação anterior ao limite não prova pendência; reconstruir aceites, cancelamentos e expiração |
| Procurações | Casos que exigiam providência no encerramento | `pre_juridico_casos`, eventos e datas de procuração | Posição no último fechamento por caso/documento | Status atual e `updated_at` não comprovam toda a transição histórica |

## Evidências locais

- A captação automática inicialmente grava `aguardando_validacao`, conforme `features/captacao-automatizada/processar-relatorio.ts`. Esse registro sozinho não é uma captação confirmada.
- A confirmação grava `concluido` ou `concluido_com_alertas`, substitui o preview e atualiza `atualizado_em`. O resumo diferencia cobranças criadas, ignoradas, divergentes e anteriores removidas. O total do preview não deve virar automaticamente o total captado.
- A migração `20260804110000_acordos_revisao_controlada.sql` altera valor/vencimento da parcela, modifica `acordos.valor_acordado` e registra `acordos_revisoes`. Selecionar acordos antigos e somar seus valores atuais pode reescrever resultados passados.
- O fechamento financeiro existente usa intervalos próprios e pode ser reapurado antes de fechado. `fechamento_periodos` não define automaticamente os ciclos de dia 10 da nova visão. `fechamento_pagamentos` só poderá ser reaproveitado após conferir granularidade, finalização, sobreposição e semântica dos valores.
- `timeline_operacional` contém eventos, status anterior/novo e payloads. A existência da tabela não garante eventos suficientes para reconstruir todos os indicadores.

## Política de disponibilidade

Cada resultado integrado deverá distinguir `disponível`, `sem movimento`, `histórico indisponível` e `erro`. Apenas uma consulta bem-sucedida sobre uma fonte com cobertura comprovada pode retornar zero como ausência de movimento.

A Captação consulta primeiro os relatórios históricos verificáveis e, quando não houver relatório validado no ciclo, usa a tabela histórica `captacao_historica_sindico`. A base `cobrancas` é operacional e pode ser limpa e recarregada a cada nova captação; portanto ela não é fonte suficiente para exibir captações de ciclos fechados ao síndico. Cada confirmação de captação deve gravar uma fotografia histórica antes que a próxima recarga substitua a base operacional.

A tabela histórica recebe somente linhas liberadas: condomínio e unidade vinculados, ciclo válido, valor numérico e sem repetição ou ambiguidade. As demais áreas continuam identificadas como em preparação. Não são usados números nem gráficos fictícios na rota da aplicação.

## Segunda entrega — relatório histórico da Captação

### Cobertura observada

Consulta somente de leitura em 07/09/2026: 89 conversões, sendo 75 confirmadas (`concluido` ou `concluido_com_alertas`), 6 com ranking por unidade. O registro mais antigo é de 10/08/2026 depois do encerramento do ciclo de agosto. Os 6 rankings verificáveis pertencem ao ciclo de setembro, ainda aberto nessa data. Assim, o período padrão de agosto corretamente informa histórico indisponível.

A consulta de diagnóstico executou a mesma projeção usada pela aplicação. Uma simulação explícita do período setembro confirmou 6 relatórios válidos; não houve mudança no relógio da aplicação nem liberação de ciclos abertos para o usuário.

### Semântica da integração

- O indicador implementado é **Débitos no relatório**: posição observada na captação, com data de referência visível. Não é saldo no fechamento nem valor de novas cobranças incluídas na operação.
- O ranking salvo na confirmação fornece o detalhamento e a classificação observada naquela data. Não são consultados status atuais para reclassificar o relatório.
- Usar somente o último relatório confirmado do ciclo. Nunca somar relatórios repetidos, nem substituir silenciosamente o último por um anterior quando o último não possui histórico verificável.
- Exigir data do ranking entre a criação e atualização da conversão, no mesmo ciclo da atualização. `atualizado_em` seleciona candidatos; não comprova sozinho a existência de histórico.
- Conferir soma em centavos e quantidade de unidades contra os totais do ranking. Valores inválidos, unidades duplicadas ou totais divergentes tornam o ciclo indisponível para conferência.
- No anual, exibir posições por competência e permitir selecionar um ciclo para os indicadores e detalhes. Não somar saldos entre meses, nem transportar o último saldo conhecido para um mês sem cobertura.
- A falta de um ranking não equivale a zero. Zero só aparece em um ranking validado e explicitamente vazio.
- A consulta pagina todos os registros confirmados do condomínio autorizado. O cliente recebe somente unidade, bloco, situação padronizada, datas de débito e valor; nomes de devedores, observações internas, contatos e planilhas não são enviados.

### Verificações executadas

- `scripts/validate-sindico-v2-captacao.ts`: ciclos, escopo do condomínio, deduplicação, totais, rankings inconsistentes, ausência de dados, anual e remoção de dados pessoais.
- Projeção JSON conferida em consulta real somente de leitura.
- Lint e checagem de tipos da nova versão aprovados.
- Interação em navegador com dados fictícios locais: 23 unidades, duas páginas, troca de ciclo, retorno à primeira página, recolhimentos independentes e ausência de transbordamento horizontal em celular.

Ainda pendente: comprovar e integrar a quantidade/valor efetivamente admitidos na operação e as posições de cobrança, acordos e pendências no fechamento. A migração `20260907190000_captacao_historica_sindico.sql` cria uma camada histórica separada para captação liberada; ela não altera cobranças, acordos, pagamentos nem status operacionais. A rota de confirmação da captação grava essa camada a partir do ranking confirmado.

## Enriquecimento por planilhas Camila

Arquivos considerados: janeiro a julho de 2026. O arquivo de agosto ficou fora do escopo. A conciliação preserva todas as linhas como auditoria, mas somente as linhas marcadas como `Liberada para histórico` podem alimentar a nova visão. Os nomes de condomínio sugeridos foram revisados e aplicados como vínculo confirmado para esta carga; unidade, data, valor e repetição continuaram como travas de qualidade.

Regra de liberação:

- condomínio vinculado ao cadastro atual por correspondência confirmada;
- unidade vinculada de forma única ao condomínio confirmado;
- entrada com ciclo válido em 2026;
- valor numérico não negativo;
- sem repetição exata do mesmo débito nas abas principais.

Linhas com condomínio ou unidade apenas sugeridos ficam retidas. Sugestão serve para saneamento de cadastro, não para exibição ao síndico. Andamentos históricos das planilhas, como acordo ou quitado, não são importados como status financeiro porque não possuem data de atualização garantida.

A carga gerada por `scripts/sindico-v2/export-captacao-historica-camila.mjs` exporta apenas as linhas liberadas para SQL de inserção em `captacao_historica_sindico`.

Em 07/09/2026, a migração `20260907190000_captacao_historica_sindico.sql` foi aplicada ao banco remoto e `scripts/sindico-v2/import-captacao-historica-camila.mjs` carregou 370 linhas liberadas com origem `camila_cronograma_2026_01_07`. As demais 591 linhas ficaram retidas para saneamento.

## Próxima decisão de implementação

1. Medir, com consultas somente de leitura, a cobertura histórica das fontes por condomínio e competência, sem expor dados pessoais nos registros de diagnóstico.
2. Selecionar quais indicadores podem ser reconstruídos e registrar as exclusões e estornos usados.
3. Para os demais, definir persistência de posições de fechamento com proveniência e detalhes reconciliáveis.
4. Integrar a primeira área somente com definição de confirmação, deduplicação e cobertura verificadas.

## Validação da primeira entrega

- Testes em `scripts/validate-sindico-v2.ts`: fronteira de meia-noite em São Paulo, virada de ano, competências inválidas/futuras, intervalos contíguos, consolidação anual e seleção autorizada.
- Lint dos arquivos novos e checagem de tipos com escopo da nova versão.
- Teste de interação dos componentes com fixture local, sem autenticação de produção: recolhimento dos indicadores, recolhimento total, preservação de estado, teclado, modo anual e largura móvel.
- A checagem de tipos de todo o projeto encontrou erro fora desta entrega em `outputs/view-butanta-simulacao/simulate-view-butanta.ts:113` (`ParseResult.error`). Esse arquivo não foi alterado.
- Autenticação real e consultas de produção ainda precisam de validação integrada; os testes de seleção autorizada não substituem essa verificação.
