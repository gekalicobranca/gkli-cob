# Procedimento de limpeza de cobranças duplicadas

Preparado em 22/09/2026, a partir da auditoria da base de produção iniciada às 19h03 (Brasília).

**Estado em 22/09/2026, 20h24 (Brasília): piloto de cinco pares aplicado e conferido.** As migrações de recibo e arquivamento estão ativas. Os 2.745 registros continuam no banco: 2.740 canônicos e cinco cópias históricas. O manifesto preliminar permanece como evidência da auditoria inicial, não como executor para o restante. Resultado e escopo efetivamente aplicado na seção 14.

## 1. Objetivo e escopo

Manter uma cobrança operacional por débito de origem, preservando provas, acordos, pagamentos, mensagens e histórico. A limpeza de repetição não decide se o débito é judicial, está em acordo, foi pago ou pode ser cobrado.

O primeiro lote considera os 204 grupos encontrados na fila: 203 pares e uma triplicidade, 409 registros, 205 cópias excedentes e R$ 325.501,33 de repetição pelo valor atual. Esses números são uma referência do snapshot, não uma meta a atingir mediante exclusões.

Ficam em lotes separados:

- 90 grupos adicionais fora da fila operacional;
- 32 grupos com mesmo recibo e valores divergentes, com participação na fila;
- casos não identificados de forma segura por condomínio, unidade, bloco e recibo;
- definição de situação jurídica e saldo de acordos, que exige conciliar a fonte e os pagamentos.

Fontes: `outputs/auditoria-cobrancas-2026-09-22/conferencia-detalhada.md` e evidências de importação identificadas nesse relatório. O manifesto preliminar fica em `outputs/auditoria-cobrancas-2026-09-22/plano-preliminar-limpeza.json`.

## 2. Contenção e correção da entrada

Antes da limpeza, preparar e ativar uma janela de manutenção para as carteiras/condomínios atingidos. Pausar importações e produtores/consumidores de cobranças e mensagens nesse escopo: confirmações manuais, captura automática, Maestro, agendadores e workers. Registrar o estado anterior de cada controle para retomada deliberada.

Não basta bloquear automação na cobrança: mensagens já agendadas, leases em processamento e mensagens consolidadas podem continuar sendo enviadas. A execução exige confirmar que não há trabalho em trânsito no escopo. Uma mensagem com resultado de envio incerto impede a execução daquele grupo até consulta do recibo do provedor. Não reenviar para testar.

Corrigir a conciliação antes de permitir novas importações:

1. Extrair o identificador completo do recibo do campo próprio ou das observações. Tratar J, A, AE e AJ como marcadores separados, conservando o texto original. Não reduzir referências desconhecidas a apenas seus primeiros dígitos.
2. Comparar identidade da carteira, condomínio, unidade/bloco e recibo. Usar vencimento, competência e principal como verificações de consistência; competência ausente não pode criar artificialmente um novo débito.
3. Se a identidade coincide e o valor ou situação diverge, encaminhar à revisão. Não criar outra cobrança nem sobrescrever silenciosamente a anterior.
4. Proteger a confirmação contra concorrência com uma operação atômica no banco. Uma consulta seguida de insert sem proteção não impede duas importações simultâneas.
5. A restrição de unicidade deve valer para identidade validada e registros canônicos, após resolver colisões existentes. Referências ausentes ou incertas exigem revisão, sem inventar identidade pelo valor/data.

Reproduzir os 204 casos da auditoria e verificar que deixam de resultar em `novo`. Testar também dois recibos diferentes no mesmo dia, cotas distintas da mesma unidade, bloco diferente, competência conflitante, mudança de encargos, repetição do próprio lote e duas confirmações concorrentes.

## 3. Backup e inventário antes de escrever

Confirmar backup recente e sua possibilidade de restauração, conforme `docs/backup-e-recuperacao.md`. Gerar adicionalmente um snapshot específico do lote, criptografado, com checksum e acesso restrito. Não usar os JSONs temporários da auditoria como substituto do backup operacional.

O snapshot do lote deve conter:

- os registros completos de cobranças, unidade, condomínio e identificação de suas fontes;
- prévias de conversão e linhas de importação utilizadas como prova;
- acordos, acordo_cobrancas, parcelas, pagamentos, fechamento e vínculos contábeis/fiscais relacionados;
- mensagens, itens de lote, flows, fingerprints, payloads, comprovantes de envio e agendas;
- saneamento, pendências, anexos, eventos e histórico;
- controles de pausa, registros em processamento e estado dos workers relevantes.

Descobrir as dependências no catálogo real do banco, inclusive FKs, triggers e restrições. Examinar também referências em JSON, listas de IDs e campos polimórficos (`entidade_tipo`/`entidade_id`), que não aparecem como FKs. A lista acima não é um inventário exaustivo. Dependência desconhecida bloqueia o grupo.

## 4. Manifesto e simulação

Refazer a consulta em produção, dentro da janela de manutenção. Gerar um manifesto versionado com ID do lote, instante, hash e, para cada grupo:

- todos os IDs candidatos e a identidade completa do débito;
- valores e status anteriores, fontes e divergências;
- registro a preservar e justificativa documentada;
- IDs a arquivar como duplicados;
- lista explícita de vínculos operacionais a redirecionar, cancelar ou manter;
- mensagens históricas e comprovantes que permanecerão intactos;
- conflitos, decisões pendentes e motivo de bloqueio;
- impacto esperado em contagem e valor, em centavos, por carteira/condomínio;
- condições de pré-execução e operações inversas para os campos alterados.

O modo padrão deve ser `simular`, sem qualquer gravação, envio, alteração de status ou atualização de timestamps de negócio. A aplicação posterior deve exigir o hash exato do manifesto final e um ID de execução. Manifesto preliminar, vencido ou com decisões pendentes não pode ser aplicado.

Comparar cada registro e suas dependências com o snapshot, usando versão/hash do conteúdo e não somente `updated_at`. Mudança de valor, status, vínculo, agenda, pagamento ou recibo de envio invalida o grupo e exige nova simulação.

## 5. Como escolher o registro preservado

Não escolher automaticamente o mais recente nem o mais antigo. Usar esta ordem de análise:

1. Preservar a continuidade do registro que suporta obrigação financeira formal: acordo, parcela, pagamento ou fechamento. Se mais de uma versão tiver vínculos incompatíveis, bloquear o grupo.
2. Manter todos os comprovantes e históricos de envio, mesmo quando pertencem a outro ID. Histórico não deve ser fundido por exclusão nem contado como novo envio.
3. Preferir o registro com identidade de origem verificável e vínculos operacionais coerentes. Completar metadados ausentes somente com fonte comprovada, registrando antes/depois.
4. Somente em grupos sem conflitos financeiros ou operacionais, usar data de criação e ID como desempate determinístico.

O registro escolhido continua com sua situação de negócio conciliada. Não transformá-lo em `ativo`, `quitado` ou `judicializado` apenas por ter sido preservado.

Casos que obrigatoriamente exigem decisão individual:

- Oasis, unidade C00035, bloco C, recibo 15747460: três versões, acordo quebrado e mudança de marcador J para AE;
- Cádiz, unidade 002113, e Villa Lobos, unidade 000709/bloco C: vínculos com acordos ativos;
- qualquer marcador jurídico/acordo divergente ou ausente em uma das versões;
- pagamentos, fechamento, anexos formais ou acordos presentes em mais de um ID;
- mesmo recibo com valores divergentes, competências incompatíveis ou origem não comprovada.

## 6. Arquivamento reversível e tratamento dos vínculos

Usar arquivamento lógico específico para duplicidade, com referência explícita ao registro canônico. Não usar suspensão de cobrança como substituto: suspensão é uma situação operacional real e pode distorcer relatórios ou ser revertida por uma ação comum.

Implementados `duplicada_de_id`, `duplicidade_lote_id` e `duplicidade_arquivada_em`, acompanhados da tabela restrita `cobrancas_duplicidade_execucoes`, com manifesto e imagens antes/depois. O motivo faz parte do manifesto. A proteção impede alterações pelo aplicativo, autorreferência e cadeias/ciclos: toda cópia aponta diretamente para um registro canônico válido, da mesma identidade.

Antes de arquivar, implementar e testar o tratamento de duplicatas em todos os consumidores: card, subtotais, listagens, exportações, indicadores, geração de boletos/documentos, criação de acordos, filtros por unidade judicializada, importação, flows, cron e workers. Uma cópia arquivada não pode entrar novamente em somas, reservas ou envios, nem provocar bloqueio jurídico da unidade apenas por seu status histórico. O histórico continua consultável com indicação do registro preservado.

Tratamento por tipo de vínculo:

| Vínculo | Tratamento |
| --- | --- |
| Mensagem enviada/aceita ou com resultado incerto | Preservar ID, conteúdo, vínculo histórico, recibo e timestamps. Não apagar, reenviar ou mudar sua identidade/fingerprint. Resultado incerto bloqueia a intervenção até esclarecimento. |
| Mensagem futura individual duplicada | Cancelar apenas a agenda comprovadamente redundante, com motivo e lote. Reavaliar a mensagem sobrevivente e registrar a decisão. |
| Mensagem consolidada para vários débitos | Conferir todos os itens e valores. Não cancelar cegamente uma mensagem que inclui cobranças legítimas. Conteúdo que precise mudar volta à revisão antes de envio, sem transmissão automática. |
| Item de lote/flow ainda operacional | Reconciliar manualmente conforme o manifesto, preservando no máximo a obrigação de envio legítima por etapa/canal. Resolver colisões de unicidade/fingerprint sem apagar prova histórica. |
| Acordo, parcela, pagamento, fechamento | Preservar instrumentos e valores. Redirecionar vínculo somente após verificar que é o mesmo débito, sem criar novo pagamento/receita nem duplicar itens do acordo. Conflito bloqueia o grupo. |
| Pendência, anexo e evento | Manter autoria e proveniência; redirecionar somente onde necessário ao funcionamento, registrando o ID anterior. Não apagar ocorrências históricas. |

Não fazer exclusão física nesta operação. Não apagar registros para aproveitar `ON DELETE CASCADE` ou `SET NULL`.

## 7. Aplicação controlada

Ensaiar primeiro em uma cópia isolada do banco, com integrações e envios desativados. Conferir simulação, aplicação, repetição da aplicação e reversão, inclusive falha no meio de um grupo.

Na produção, começar por um piloto de até cinco grupos com fontes completas, sem divergência de situação, sem acordo/pagamento e com agendas reconciliadas. Se nenhum grupo atender, concluir primeiro a revisão necessária; não relaxar critérios para obter um piloto.

Aplicar cada grupo em transação atômica no banco, incluindo mudanças de vínculos, arquivamento e auditoria. Não usar uma sequência de chamadas REST como se fosse transação. Bloquear os registros e verificar o manifesto novamente sob lock. Ordenar locks de forma estável. Qualquer divergência ou erro desfaz o grupo inteiro.

Usar chave de idempotência por lote/grupo: repetir a operação não duplica eventos, não soma impactos novamente e não recria mensagens. Não realizar chamadas externas dentro da transação. Falhas interrompem os lotes seguintes e mantêm o escopo operacional pausado até revisão.

Depois do piloto validado, avançar em lotes pequenos, com resumo persistido de grupos aplicados, bloqueados e não executados. Os casos individuais não entram automaticamente no mesmo lote.

## 8. Conferência após cada lote

- Todas as cópias arquivadas apontam para um canônico válido; nenhum ID não previsto foi alterado.
- O principal e os encargos não mudaram por causa da deduplicação; qualquer alteração financeira tem justificativa separada.
- Soma do card = soma dos subtotais globais das carteiras = soma dos débitos canônicos dos mesmos filtros.
- O impacto bate em centavos com a simulação daquele lote, considerando reclassificações explicitamente aprovadas. Não usar R$ 325.501,33 como alvo fixo se houve mudança de dados ou classificação.
- Não há cobranças arquivadas disponíveis para novos acordos, boletos, agendamentos ou envios.
- Quantidade/valor de pagamentos e instrumentos formais foram preservados; nenhum evento financeiro novo foi produzido.
- Mensagens históricas e recibos continuam íntegros; nenhum envio foi executado pela limpeza. Fila futura e mensagens consolidadas foram revisadas.
- Repetir a importação de teste e a própria aplicação não cria duplicatas.

Retomar importações somente após confirmar a proteção de entrada. Retomar envio apenas para os grupos/canais validados, restaurando os controles anteriores de forma deliberada. Não liberar automaticamente uma fila acumulada só porque o arquivamento terminou.

## 9. Reversão

Manter o escopo pausado. Reverter somente os grupos identificados no lote, por transação e em ordem inversa das operações. Exigir que os valores atuais dos campos a reverter coincidam com a imagem posterior gravada pela limpeza; mudança posterior bloqueia reversão automática e exige conciliação.

Restaurar vínculos e campos antes/depois a partir do log, sem apagar eventos de auditoria nem sobrescrever pagamentos ou interações posteriores. Não reativar agendas ou reenviar mensagens como efeito do rollback. Mensagens canceladas pela limpeza continuam bloqueadas até revisão humana. Uma mensagem já transmitida não pode ser desfeita no banco.

Usar restauração completa de backup somente para recuperação de desastre, em ambiente separado, conforme o procedimento de backup. Não restaurar toda produção para desfazer um pequeno lote e perder trabalho legítimo de outros usuários.

## 10. Condição de encerramento

Emitir relatório final com lote/hash, antes/depois por carteira e condomínio, IDs preservados/arquivados, vínculos reconciliados, bloqueios remanescentes e controles retomados. Afirmar saldo disponível para cobrança somente após resolver também a situação jurídica, acordos e versões de valores divergentes. Deduplicação, sozinha, não comprova exigibilidade nem ausência de pagamento.

A criação deste procedimento não aplica o plano à produção. A execução deve partir de manifesto final atualizado, com todas as decisões do lote resolvidas e resultados do ensaio anexados.

## 11. Conciliação das três bases externas

Incorporadas à análise em 22/09/2026: `FECHAMENTO 08-2026.xlsx`, `CASOS PRÉ-JURIDICO 07-2026.._.xlsx` e `ACORDOS (REPASSE DE HONORÁRIOS) JUDICIAL 2026.xlsx`. O manifesto preliminar versão 2 registra os hashes dos arquivos e referências a abas/linhas. O cruzamento usa o mesmo snapshot de produção da auditoria; deve ser atualizado antes da execução.

O fechamento contém 447 lançamentos: 82 na aba judicial, 70 na GEKALI e 295 na extrajudicial Genske. Os 82 lançamentos judiciais coincidem com os 82 da aba 08-2026 do controle judicial nos identificadores e dados de parcela comparados. São fontes sobrepostas, não valores adicionais para somar.

O controle de pré-jurídico contém 63 casos, um deles com observação de cancelamento. Apesar do nome 07-2026, há entradas em setembro/2026 e seis linhas com data 02/09/2029, que precisam de conferência na fonte. Não interpretar o nome do arquivo como data de corte nem o simples preenchimento de CRI/procuração/ASTREA como prova de ajuizamento.

No cruzamento por CNPJ, unidade/bloco e competência, foram identificados na fila 35 registros (R$ 29.439,60) com competências listadas no fechamento e 31 (R$ 28.852,03) no controle de pré-jurídico, desconsiderando cancelamento explícito. São 66 registros distintos, R$ 58.291,63; 11 desses registros também aparecem nos grupos de duplicidade. Esses valores não podem ser somados ao excesso de duplicidade nem subtraídos novamente sem identificar cada recibo canônico. A comparação de competência é mensal, não uma interpretação jurídica dos limites diários de cada acordo.

Regras adicionais obrigatórias:

1. Registrar separadamente acordo, parcela, cota original, honorários e repasse. Coluna de repasse não é saldo do débito nem prova de quitação.
2. Presença no fechamento não autoriza baixa: há observações de pagamento aguardando confirmação. Exigir confirmação financeira individual e vínculo ao recibo/parcela correspondente.
3. Presença no pré-jurídico exige revisão operacional, não conversão automática para judicializado. Conferir cancelamentos e data da última movimentação.
4. Identidade de unidade sem coincidência de competência fica como pendência. Não bloquear cotas posteriores apenas pela existência de acordo antigo; não liberar automaticamente quando a competência estiver ausente.
5. Nos acordos, conciliar os períodos negociados e parcelas pagas/em aberto. Registros repetidos entre meses e arquivos devem apontar para o mesmo acordo, sem duplicar saldo ou recebimento.
6. Datas inválidas, CNPJ ausente/divergente, bloco ambíguo, categoria em branco e linhas de VERIFICAR impedem decisão automática. Correspondência por semelhança de nome não é suficiente.
7. Ausência de correspondência nesta análise não comprova que a cobrança está livre de acordo, pagamento ou restrição. Permanecem referências sem identificação única.

Detalhamento e referências: `outputs/auditoria-cobrancas-2026-09-22/cruzamento-tres-bases.md`.

## 12. Primeira entrega: prevenção e simulação

Implementados: extração compartilhada de recibo, conciliação paginada sem limite de 25 candidatos, revisão de divergências de valores/competência/vencimento/marcadores, bloqueio de recriação de recibos quitados e persistência de recibos explícitos nas observações. Mudança de carteira não cria outra identidade para o mesmo recibo da mesma unidade.

A migração `20260923010000_cobrancas_recibo_guard.sql` prepara um contador protegido por chave única de unidade/recibo. A carga inicial registra as colisões legadas sem alterar cobranças nem escolher um canônico. Triggers mantêm o contador em inserções, alterações de identidade e exclusões; o conflito da chave única desfaz a escrita inteira. Recibos sem identidade reconhecível ou cobranças sem unidade ficam fora dessa proteção, exigindo conferência específica. A remoção do último registro libera sua identidade, para manter o funcionamento da substituição de cargas já existente no sistema. O procedimento de limpeza continua proibindo exclusão física.

**Migração ativa desde 22/09/2026, 19h49 (Brasília).** O acesso direto autorizado ao banco, com certificado TLS validado, resolveu o bloqueio da Management API. O ensaio com duas conexões PostgreSQL confirmou espera pela transação concorrente, rejeição de recibo repetido após commit e permissão após rollback. A ativação preservou o hash integral dos 2.745 registros. Evidências: `teste-concorrencia-recibos.json` e `ativacao-trava-recibos.json`, no diretório de auditoria.

Comandos reproduzíveis (fontes locais de auditoria contêm dados restritos e não devem ser versionadas):

```powershell
node node_modules/tsx/dist/cli.mjs --test scripts/validate-conciliacao-recibos.ts
node node_modules/tsx/dist/cli.mjs scripts/replay-conciliacao-auditoria.ts .codex-tmp/judicial-review
node node_modules/tsx/dist/cli.mjs scripts/simular-limpeza-duplicidades.ts outputs/auditoria-cobrancas-2026-09-22/plano-preliminar-limpeza.json .codex-tmp/judicial-review/audit-db.json .codex-tmp/judicial-review/audit-evidence.json outputs/auditoria-cobrancas-2026-09-22
```

Replay dos 204 grupos: 105 `ja_existente`, 99 `divergente`, zero `novo`. O replay fornece ao conciliador somente o registro anterior e os dados da reimportação, para reproduzir a condição de entrada; os testes sintéticos separados verificam filtros e paginação.

A simulação offline valida hashes/identidades/valores e gera `simulacao-limpeza.json` e `simulacao-limpeza.md`. Resultado: 83 propostas condicionais de preservação, 121 grupos sem escolha e **zero grupos liberados**. Todos possuem mensagens ou itens de lote, além do inventário completo e da atualização do snapshot ainda necessários. As propostas não são decisões finais: `preservar_id`, `arquivar_ids` e `operacoes` continuam vazios no plano aplicável. O script não tem cliente de banco nem modo de aplicação. Não houve arquivamento, baixa, suspensão ou envio.

## 13. Ensaio do primeiro piloto

Conferidos os pares do Rio Negro nas unidades 001313, 001717, 001008, 001716 e 001519. O excesso potencial desses cinco pares é R$ 4.793,75. A coleta detalhada encontrou 14 mensagens (cinco enviadas, nove canceladas), cinco tentativas de e-mail marcadas como enviadas, nenhuma entrada na agenda atual de e-mail, nenhum envio Thunderbird e nenhum anexo vinculado às mensagens consultadas. Não foi feita consulta ao provedor para comprovar entrega.

Os payloads das cinco mensagens enviadas contêm as duas cópias de cada débito, com valor dobrado no contexto interno. O corpo de texto e o assunto salvos não exibem esse valor. Uma mensagem está ligada às duas cópias; isso não demonstra dois envios. O histórico será preservado integralmente, incluindo seu contexto original.

Foram encontradas cinco pendências abertas de cobrança ausente no relatório, vinculadas aos registros antigos da conversão. A conciliação offline com as linhas persistidas da importação reconhece os cinco recibos e propõe resolver esses alertas como falsos positivos, sem baixa ou mudança jurídica. A execução deve conferir novamente a fonte real e seu hash. O inventário completo encontrou cinco parcelas financeiras ligadas às cobranças antigas; portanto, a decisão atual é preservar o registro da conversão nos cinco pares, mantendo as parcelas e todas as mensagens em seus vínculos originais. Isso substitui a proposta inicial baseada apenas na mensagem enviada.

O protótipo em `scripts/limpeza-duplicidades/` passou nos testes locais de arquivamento, idempotência, atomicidade e reversão condicionada à imagem posterior. Com os dados reais, recusou os cinco grupos por pendência aberta. No cenário hipotético de pendências já resolvidas, exclusivamente em PGlite descartável, a projeção passou de dez para cinco registros e de R$ 9.587,50 para R$ 4.793,75, sem modificar mensagens; a reversão foi integral.

O inventário real consultou referências UUID/JSON/arrays em 100 tabelas, restrições, triggers, views, funções e jobs. O ensaio PostgreSQL em schema isolado preservou 14 mensagens e cinco parcelas, passou de dez para cinco cobranças canônicas, bloqueou nova mensagem e alteração dos campos de arquivo pelo `service_role`, e reverteu as somas. Esse ensaio copia colunas, checks e índices; não reproduz integralmente RLS, FKs e todos os triggers originais.

As migrações `20260923020000` e `20260923021000` foram instaladas sem arquivar registros. Os resultados das 18 views foram comparados antes/depois, sem alteração. O aplicativo integra 73 consultas diretas, subtotais, elegibilidade, documentos, importações e validação adicional antes de envio. O histórico continua acessível e a página da cópia é somente leitura. A reserva atômica de e-mail, WhatsApp e início de envio Thunderbird usam a elegibilidade protegida no banco. A variável `COBRANCAS_ARQUIVAMENTO_ATIVO` é ativa por padrão; nunca desativá-la com cópias arquivadas, pois isso recolocaria cópias em consultas antigas. Em bancos novos, aplicar as migrações antes de publicar esta versão.

O SQL do protótipo continua separado das migrações e não deve ser instalado em produção. Os resultados iniciais `ensaio-piloto.json` são históricos e não representam aplicação real. Evidências atuais: `teste-integracao-arquivamento.json`, `conciliacao-pendencias-piloto.json` e `ativacao-base-arquivamento.json`. Nenhuma mensagem foi enviada pela limpeza.

## 14. Resultado do piloto aplicado

Lote `79df4c89-2533-4d3b-8833-04484586dee6`, concluído em 22/09/2026 às 20h23min24s (Brasília). Manifesto SHA-256 `17d0835b322c39bf53bd5befda15200ffa761d1c9e65d0c7224d95a80296efa1`. Aplicativo publicado em produção no commit `460ea9c` antes da aplicação.

Arquivadas cinco cópias novas do Rio Negro, preservando os cinco registros antigos com parcelas. Competências completadas a partir das linhas de importação conferidas. Cinco alertas falsos de ausência resolvidos com motivo/fonte, sem baixa ou mudança financeira/jurídica. As 14 mensagens, cinco tentativas de envio, cinco parcelas, itens e históricos permaneceram intactos. As nove mensagens que contêm cópia arquivada estão inelegíveis pelo bloqueio SQL; as outras continuam em seu status terminal. Nenhum envio foi realizado pela limpeza.

| Carteira | Quantidade após piloto | Valor da fila após piloto |
| --- | ---: | ---: |
| Genske Advogados | 1.511 | R$ 1.711.440,80 |
| GEKALI | 305 | R$ 397.976,40 |
| Azevedo Araújo | 431 | R$ 255.238,69 |
| **Total** | **2.247** | **R$ 2.364.655,89** |

Redução exata de cinco registros operacionais e R$ 4.793,75, com igualdade entre card e subtotais globais das carteiras nos mesmos filtros. O Rio Negro passou de 199 registros/R$ 202.008,80 para 194/R$ 197.215,05. Reimportação conferida somente em leitura: cinco recibos `ja_existente`, zero `novo`, todos apontando para os IDs preservados.

Backup suplementar criptografado com AES-256-GCM, chave DPAPI do perfil Windows atual, checksum e restauração em schema isolado. Testados aplicação, falha intermediária com rollback, repetição idempotente e reversão. O executor grava no banco imagens anteriores/posteriores dos registros alterados e hashes de todas as dependências; a fonte completa fica no backup, evitando uploads grandes dentro da transação. A reversão conserva a auditoria e exige imagem posterior intacta; timestamps de atualização avançam normalmente.

A primeira tentativa em produção foi desfeita por timeout do inventário, sem aplicação parcial. A consulta de inventário recebeu orçamento de 60 segundos; mutações continuam com 30 segundos e obtenção de locks com quatro segundos. A execução final durou aproximadamente 80 segundos. Os dois agendadores foram pausados e restaurados ao estado anterior; foi confirmada ausência de envios em trânsito. Locks abrangem as tabelas públicas inventariadas, preservando leituras e bloqueando escritas durante a janela. Essa estratégia precisa ser reduzida/otimizada antes de lotes maiores.

Os outros 199 grupos da auditoria inicial não foram incluídos. O total da fila ainda não representa saldo líquido integralmente conciliado com acordos, pagamentos e bases jurídicas.

Evidências em `outputs/auditoria-cobrancas-2026-09-22/`: `resultado-piloto.md`, `piloto-producao-aplicar.json`, `verificacao-final-piloto.json`, `fila-depois-piloto.json`, `teste-executor-piloto.json`, `replay-piloto-producao.json`, `controle-janela-piloto.json` e `backup-piloto/verificacao.json`. Dados restritos não são versionados. Executor administrativo em `scripts/limpeza-duplicidades/piloto-transacional.mjs`; não expor como RPC ou endpoint do aplicativo.
