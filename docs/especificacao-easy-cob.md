# Easy Cob — especificação funcional e técnica

Data: 18/11/2026. Referência de código: commit `871a57d4` do GKLI Cobrança.
Estado: análise estática e especificação de referência; implantação e funcionamento em produção não verificados.

Evolução local posterior à análise: ver [E0 e primeira contenção P0](easy-cob-e0-contencao.md), [P0-B transacional](easy-cap-p0b-transacional.md) e [P0-C Flow recuperável](easy-flow-p0c-transacional.md). O comportamento descrito abaixo é o baseline. No worktree, prévias novas Easy Cap usam commit transacional; Flows novos usam ledger por parte, montagem/liberação transacionais e reconciliação por recibos. Rotinas destrutivas antigas e execuções sem evidência continuam contidas. Nenhuma publicação em produção foi realizada; homologação integral permanece pendente.

## 1. Escopo e confiabilidade

Este documento descreve o módulo integrado Easy Cob, suas dependências e os requisitos para sua evolução. Também compara o protótipo local `C:/Users/Gekali/Documents/ChatGPT/esay-cob`, composto por `index.html`, `app.js` e `styles.css`.

Na data da análise, grande parte de `app/`, `features/`, `supabase/` e `docs/` estava removida no diretório de trabalho. A implementação integrada foi consultada com `git show HEAD:<arquivo>`, sem restaurar arquivos. Os scripts Easy presentes localmente também foram consultados. O protótipo foi lido diretamente e pode evoluir independentemente do Git do GKLI.

Classificação das afirmações:

- **Observado:** comportamento presente nos arquivos analisados; não implica execução validada.
- **Requisito:** comportamento esperado para evolução, homologação ou correção.
- **Pendente:** decisão, dependência ou garantia que esta análise não estabeleceu.

Não foram executados aplicação, testes, workers, migrations, consultas remotas ou envios. A análise não certifica todas as regras transitivas dos domínios compartilhados. Especialmente em cálculos e importadores, os helpers especializados continuam sendo a referência executável.

## 2. Visão do produto

Easy Cob oferece percursos curtos para tarefas frequentes da operação condominial. É uma camada de experiência e orquestração sobre os domínios GKLI de acordos, conversão, cobrança, mensageria e agentes.

| Área | Objetivo | Resultado principal |
| --- | --- | --- |
| Acordos | Consultar, criar, cancelar e efetivar | Acordo e plano operacional de parcelas |
| Easy Cap | Captar relatórios sem agente remoto | Conversão confirmada e atualização de cobranças |
| Easy Flow | Montar e liberar comunicação sem agente remoto | Flows montados pausados e depois liberados |
| Easy Pag | Conferir recebimentos por administradora | Evidências de consulta e planilha de pendências |
| Easy Maestro | Solicitar captação automática | Execuções de agentes, importação e montagem opcional |

Fora do escopo próprio: emissão bancária de boletos, processamento de pagamentos, substituição dos portais de administradoras, operação judicial completa e criação de um segundo cadastro financeiro. Acesso aos detalhes completos permanece disponível no GKLI.

## 3. Usuários, autorização e isolamento

**Observado:** escrita em acordos, captação, Flow, consultas de pagamento e Maestro exige perfil `admin`, `gestor` ou `operador`. Consultas usam `getPermittedCarteiras`; a disponibilidade de leitura para outros perfis depende desse helper e das políticas de domínio, não apenas do menu.

**Requisitos transversais:**

1. Toda operação deve autenticar o usuário e validar carteira e entidade no servidor.
2. IDs recebidos da interface nunca conferem autorização por si sós.
3. Uso de cliente administrativo exige filtros explícitos e verificação de papel, pois não se pode depender de RLS nesse caminho.
4. Prévia de captação e execução Easy Flow pertencem ao operador que as criou.
5. Mudança de carteira, condomínio, unidade, documento ou configuração invalida a revisão anterior quando alterar suas condições.
6. Negação de acesso não deve retornar dados, anexos ou informações de destinatários.

**Observado no schema:** `easy_flow_execucoes` e `easy_pague_consultas` têm RLS habilitada e acesso direto revogado para `anon` e `authenticated`; servidor e worker utilizam `service_role`. A RPC de aplicação das parcelas do PDF utiliza sessão autenticada e verifica papel e carteira internamente.

## 4. Navegação e experiência

Entrada: `/app/configuracoes/easy`.

| Rota | Função |
| --- | --- |
| `/app/configuracoes/easy/acordos` | Operações via `operacao`, `condominio`, `unidade`, `acordo` |
| `/app/configuracoes/easy/acordos/simular` | Reutiliza criação GKLI com `easy=1` e `cobrancaIds` |
| `/app/configuracoes/easy/captacao` | Captação manual |
| `/app/configuracoes/easy/flow` | Wizard de montagem e liberação |
| `/app/configuracoes/easy/pag` | Consulta financeira |
| `/app/configuracoes/easy/maestro` | Captação automática |

Rotas antigas sob `flow/maestro` e `flow/pague` redirecionam permanentemente para as áreas atuais. `features/easy-cob/legacy.ts` centraliza a composição de URLs antigas, preservando parâmetros.

**Requisitos de interface:** seleção progressiva, contexto de condomínio/unidade visível, resumo antes de efeitos relevantes, botões bloqueados durante processamento, estados vazios úteis, erros recuperáveis e resultado explícito. Usar nomes operacionais de condomínio quando disponíveis. Valores em BRL; datas civis sem deslocamento por fuso. Tabelas devem funcionar em telas estreitas, controles devem ter rótulos e mensagens assíncronas devem ser acessíveis.

## 5. Acordos

### 5.1 Consultar

**Observado:** a página carrega condomínios e unidades por carteira, pagina consultas em blocos de 500 e aplica filtros canônicos em acordos/cobranças. Para operações sobre acordos, as unidades são filtradas conforme elegibilidade. Seleciona acordo solicitado ou, por preferência, um vigente entre os mais recentes. Parâmetros que não correspondem ao conjunto consultado podem resultar em `notFound()`.

Exibe valor acordado, data, status, parcelas com número, vencimento, valor e situação, além de acesso a `/app/acordos/<id>`. Quando houver vários acordos, permite escolher. Parcela número zero aparece como entrada.

### 5.2 Criar e simular

Percurso: condomínio → unidade → cobranças disponíveis → condições → revisão → criação no domínio de acordos.

**Observado:** seleção utiliza `listCobrancasDaUnidadeParaAcordo`, filtro `cobrancaAtiva` e valor via `valorCotaParaAcordo`. A simulação reutiliza `NovoAcordoPage` e `AcordoSimulatorForm`, com interface simplificada. A unidade pode ter vários acordos; a disponibilidade precisa respeitar o vínculo de cada cobrança.

Na etapa de valores do Easy, o operador informa o repasse em reais ou em percentual (0 a 100%, com até duas casas decimais). A base é a soma das cotas selecionadas, usando o valor da carteira quando o ajuste fica em branco. O simulador exibe o repasse em reais, arredondado ao centavo, e usa esse valor na proposta e na criação do acordo.

O simulador integrado contempla despesas de cobrança percentuais, custos de emissão de boleto, crédito e entrada no cálculo compartilhado, juros adicionais no parcelamento e plano manual. A interface simplificada indica Price a 1% ao mês para juros do parcelamento. Regras de isenção de cotas, aprovação do síndico e pendências pertencem ao domínio compartilhado; não devem ser reimplementadas isoladamente no Easy.

**Requisitos:**

- Revalidar seleção, valores, vínculos e carteira na confirmação, inclusive em requisições concorrentes.
- Exibir separadamente subtotal, despesas, emissão, juros, ajustes e total final.
- Garantir soma exata em centavos e vencimentos civis mensais válidos.
- Aplicar limite de parcelas sem aprovação configurado por condomínio e as pendências de autorização correspondentes.
- Diferenciar simulação, minuta, criação, aprovação e homologação; baixar minuta não cria acordo nem comprova aceite.
- Na P2 local, “Baixar simulação (TXT)” exporta as condições exibidas na conferência como `simulacao-de-acordo.txt`. O arquivo identifica a prévia e contém as cobranças, os totais e as parcelas. Durante a edição manual, o operador conclui a edição antes do download. A criação continua em ação própria. O modelo do documento final, seu formato e a evidência de aceite aguardam definição de negócio e jurídico.

### 5.3 Cancelar

**Observado:** exige motivo e confirmação. A UI exclui estados `cancelado`, `quitado`, `rompido`, `quebrado`, `renegociado`, e bloqueia parcelas com data de pagamento ou status pago/quitado. O servidor reutiliza `cancelarFormalizacaoAcordo`, que confere carteira e pagamentos novamente.

Anexo opcional: PDF com assinatura `%PDF-`, até **2.000.000 bytes**. É armazenado em `acordos-pdfs`, caminho `easy/debitos/<acordo>/<uuid>.pdf`. O evento `acordo.debito_atualizado_anexado` registra o vínculo; falha nesse registro remove o upload. Link de leitura assinado dura 600 segundos.

A rotina compartilhada altera acordo/fluxo para cancelado, expira termos não aceitos, cancela parcelas nos status previstos e trata cobranças vinculadas. Não presumir que todos esses efeitos estejam em uma única transação: a action executa múltiplas chamadas.

**Pontos de atenção:** o anexo/evento pode persistir mesmo se o cancelamento posterior falhar; o servidor compartilhado não lista `renegociado` no mesmo bloqueio inicial da UI. Requisito: uniformizar estados permitidos, tornar resultado parcial visível e garantir atomicidade ou recuperação auditada. Cancelamento não equivale a rompimento de acordo com pagamento.

### 5.4 Efetivar pelo PDF da administradora

**Observado:** apenas acordo extrajudicial, não homologado, não encerrado e sem aprovação de síndico pendente aparece como elegível. O documento deve ser PDF pesquisável, sem senha, até **3.145.728 bytes**, com leitura de até 40 páginas. Referência tem até 150 caracteres.

Fluxo: escolher PDF → extrair plano → conferir parcelas/avisos/diferença de total → confirmar → reler no servidor → aplicar RPC. A action verifica SHA-256 do arquivo; a RPC verifica revisão do acordo sob trava.

`acordo_aplicar_parcelas_pdf_adm`:

- Aceita de 1 a 360 registros, números únicos, entrada zero e parcelas positivas sequenciais conforme validação SQL.
- Valida datas, valores positivos e pagamento informado dentro dos limites.
- Preserva IDs de parcelas existentes por número.
- Bloqueia alteração de valor/vencimento de parcela paga, inclusão de pagamento não conciliado e alteração incompatível com repasse informado.
- Bloqueia remoção de parcela com pagamento, cancelamento, revisão ou fechamento financeiro.
- Confere necessidade de nova aprovação do síndico quando o plano excede o limite configurado.
- Atualiza total/entrada/quantidade, registra homologação e evento `acordo.parcelas_pdf_aplicadas` com antes/depois numa transação.
- Reconhece repetição equivalente de documento/plano/referência já homologados.

O total confirmado do PDF pode substituir o total simulado; a interface mostra a divergência e exige confirmação. Essa operação não deve baixar pagamentos encontrados no documento sem conciliação própria.

## 6. Easy Cap — captação manual

### 6.1 Elegibilidade e entrada

**Observado:** condomínio ativo, carteira permitida, CNPJ com 14 dígitos e agente remoto com estado `nao_configurado`. Consulta indisponível de agentes bloqueia a seleção. Agente existente direciona para Maestro.

Aceita PDF pesquisável, XLS, XLSX, CSV, HTML/HTM pelo motor compartilhado; modelo manual aceita apenas XLSX. O fluxo anuncia até 32 MB na origem e 4 MB após compactação no transporte. Os limites efetivos devem continuar centralizados em `upload-limits` e `prepare-upload`; extensão não substitui validação do parser.

### 6.2 Prévia

`POST /api/easy-cob/captacao`, multipart: `condominio_id`, `file`, opcionais `file_encoding`, `original_mime_type` e `modelo=easy_flow_v1`.

Valida tipo cobrança e presença de linhas; unidade, data válida e total positivo; componentes financeiros não negativos; parcelas completas; duplicidade por bloco/unidade/recibo ou vencimento; inconsistências críticas; soma do relatório com tolerância máxima de um centavo. Quando o parser detecta condomínio, compara com o selecionado. Ausência de identificação gera aviso para conferência.

Persiste `conversoes_relatorio` com origem `easy_captacao` e status `preview`. Guarda hash do arquivo, operador, snapshot de substituição e assinatura HMAC-SHA256 da prévia ligada a conversão/condomínio/carteira. O segredo permanece no servidor.

Resposta: `{ok,resumo}` com IDs, arquivo, quantidades, total, ano, quantidade anterior a substituir, origem, avisos e até oito linhas de amostra. Falhas retornam `{ok:false,error}`; autenticação/autorização também têm respostas próprias.

### 6.3 Confirmação e substituição

`POST /api/conversao-relatorio/confirmar`, JSON: `conversaoId`, `condominioId`, `carteiraId`, `easy:true`, `confirmacao:true`.

Revalida usuário autor, papel, condomínio, agente, origem, assinatura e conteúdo. Conversão concluída pode retornar reconhecimento de confirmação anterior. `easy_preparar_captacao` trava conversão/condomínio/cobranças, rejeita concorrência e compara versão e ano do snapshot antes de chamar a substituição compartilhada do Maestro.

O snapshot observado recorta ano corrente em São Paulo, cobranças sem duplicidade e com estado operacional `regular`, `novo` ou `em_cobranca_ativa`, sem vínculos de acordo ou dependentes duplicadas. O conjunto efetivamente removido/preservado depende da versão vigente de `maestro_substituir_cobrancas_conversao` e suas migrations posteriores. Não confundir o total do arquivo com o total elegível à substituição.

Retorna contadores de criadas, ignoradas, removidas e inconsistências. Há estados `processando`, `concluido`, `concluido_com_alertas` e `falha`. **Limitação observada:** preparação/substituição e importação posterior não formam uma única transação global; falha após substituição é explicitamente possível. Requisito: fornecer recuperação por execução e impedir reenvio cego.

### 6.4 Planilha manual v1

Modelo: `public/modelos/easy-flow-importacao.xlsx`; aba `Cobranças`, marcador A1 `Easy Flow - importação manual v1`, CNPJ em B3, cabeçalhos na linha 8, dados desde a linha 9. Até 5.000 cobranças em 12 colunas.

| Coluna | Conteúdo e regra |
| --- | --- |
| A | Bloco opcional |
| B | Unidade obrigatória |
| C | Vencimento obrigatório, data Excel ou civil válida |
| D | Valor original obrigatório e positivo |
| E–G | Multa, juros e correção opcionais; vazio tratado como zero nesses componentes |
| H | Valor atualizado, igual à soma D:G; fórmula apenas a prevista no modelo |
| I | Responsável obrigatório |
| J | Um e-mail válido, se informado |
| K | Telefone com 10 a 13 dígitos, se informado |
| L | Recibo opcional |

Exige e-mail ou telefone e contato consistente entre linhas da mesma unidade/bloco. Rejeita fórmulas nos demais campos, erros de célula, valores com precisão inválida e texto acima de 500 caracteres. Erros são apresentados por linha, com os dez primeiros e contagem adicional; qualquer erro impede a importação da planilha. A exceção explícita dos componentes opcionais não autoriza transformar valores financeiros obrigatórios ausentes em zero.

### Captação com montagem opcional do Flow

Na conferência do arquivo, o operador pode escolher **Montar Flow após a captação com a configuração deste condomínio?**. A tela mostra a régua ativa cadastrada no condomínio e seus canais. Para e-mail, mostra a conta da rota específica ou a conta ativa de maior prioridade da carteira usada pelo Easy Flow. Uma régua ausente ou SMTP incompatível permite continuar somente com a captação. A planilha manual dentro do Easy Flow oferece a mesma escolha.

Depois do recibo da importação, o servidor reconfere a configuração apresentada e calcula a elegibilidade atual do condomínio. A migration `20261120013000_easy_flow_apos_captacao.sql`, posterior à retenção P2, vincula a execução ao recibo por uma chave única. A operação exige o mesmo operador, condomínio e carteira. Uma execução anterior aberta de outra origem segue para conferência no Easy Flow. Cada parte usa a montagem transacional existente. O resultado fica pausado até o operador liberar no Easy Flow.

A tela conduz a sequência enquanto está aberta. Se a resposta da captação se perder, a consulta do recibo permite continuar. Se a montagem for interrompida, consulte o mesmo condomínio no Easy Flow para recuperar as partes. O diagnóstico por ID de uma captação confirmada também abre o condomínio. Uma montagem pendente ou recusada preserva o resultado da importação.

## 7. Easy Flow

**Observado:** destina-se a condomínio ativo sem agente remoto; permite listar sem exigir CNPJ, mas uma captação manual continua exigindo-o. Configuração consulta réguas ativas de cobrança da carteira, canais e contas SMTP ativas. Rota SMTP do condomínio restringe a escolha; conta incompatível bloqueia. Transporte Thunderbird não oferece SMTP por esse percurso.

### 7.1 Planejar

Consulta cobranças canônicas em `novo` ou `em_cobranca_ativa`, até 5.000 por condomínio. Revalida acordos vigentes por vínculo direto e associativo; consulta ocupação de canais e resolve contatos principais/de apoio conforme preferência da régua.

Aplica helpers de elegibilidade para prazo, situação financeira/operacional, bloqueios e judicialização; também exclui conflito de canal, responsável ausente, contato ausente/inválido e expiração para pré-jurídico quando configurada. A validação final dos canais pertence ao domínio compartilhado.

Resumo: cobranças, unidades, valor, motivos de exclusão, régua, canais, SMTP, amostra e partes. Congela hashes das cobranças/contatos e da régua para detectar alteração antes da montagem.

### 7.2 Montar e liberar

Uma execução ativa por condomínio, com proprietário operador. O plano é dividido preservando as cobranças da mesma unidade: alvo de 20 cobranças por parte, grupo individual de até 40; unidade acima de 40 é rejeitada pelo divisor. Esses números não equivalem a uma cota global de envio.

Montagem reivindica estado por atualização condicional, promove cobranças `novo` para `em_cobranca_ativa` e chama criação compartilhada com `criar_pausado=true`. Confere flows retornados e acumula IDs/quantidade de mensagens. Antes de cada parte, recalcula elegibilidade e versões.

Liberação é separada, por índice de Flow. Revalida disponibilidade SMTP, reivindica estado e chama `enviarFlowCobranca`. Conclusão significa que as liberações foram registradas, não que todas as mensagens chegaram aos destinatários. Agenda, cotas, janelas e providers continuam sob controle da mensageria.

| Estado | Significado/saída |
| --- | --- |
| `preview` | Plano salvo; pode ser descartado para `cancelado` |
| `montando` | Parte reivindicada |
| `entre_partes` | Parte concluída; próxima disponível |
| `pronto` | Montagem completa ou aguardando próxima liberação |
| `liberando` | Liberação reivindicada |
| `concluido` | Todas as liberações registradas |
| `atencao` | Falha ou resultado que exige conferência |
| `cancelado` | Prévia descartada |

**Limitações:** criação, atualização operacional e persistência da execução ocorrem em chamadas distintas. Falha pode deixar efeitos parciais; a action preserva IDs conhecidos e orienta não repetir. O índice único não inclui `atencao`, portanto esse estado não garante bloqueio de nova execução. Não foi identificada nessas actions uma recuperação por lease para `montando`/`liberando` interrompidos. Requisito: reconciliar flows e mensagens reais antes de retomar ou liberar nova montagem.

**Atualização local P1/P2.** A conferência administrativa consulta a execução por ID. No protocolo 3, a reconciliação dos contadores usa recibos, motivo, versão e chave de operação. Após resposta inconclusiva, a interface exige uma nova leitura. Se a versão e a intenção permanecem as mesmas, a retomada usa a chave anterior. Execuções legadas seguem para revisão manual.


## 8. Easy Pag / Easy Pague

O produto usa título Easy Pag e nomes técnicos `easy_pague_*`; são a mesma área. Consulta parcelas de acordos por administradora normalizada, com data limite **ontem em America/Sao_Paulo**.

**Observado:** acordos em `ativo`, `em_dia`, `em_atraso` ou `vencido`; parcelas `aberta`, `vencida` ou `pendente`, sem data de pagamento e vencidas até o corte. Consulta remota depende de configuração scanner ativa/validada, vínculo de unidade, portal suportado e disponibilidade financeira. A migration contempla Lello, Manager, BBZ e Sell. Sem configuração, a parcela pode permanecer disponível para conferência por planilha.

Fila `easy_pague_consultas` agrupa alvos por configuração/unidade/data limite. Chave única evita duplicação no mesmo corte. Worker reserva até dez pedidos por configuração, com token e lease de cinco minutos, compartilha controle do scanner, usa trava local do portal e timeout de 220 segundos. Há contador de tentativas e tratamento de falhas/expiração; o fluxo limita reprocessamentos interrompidos a três tentativas.

Estados de execução: `fila → consultando → concluido` ou `falha`, com retorno à fila conforme tentativa. Resultado financeiro por alvo é independente: `confirmado` ou `pendente`.

Confirmação exige identificação inequívoca, data até o corte, vencimento compatível, valor original exato e valor pago pelo menos igual ao alvo. Lello usa acordo externo e número; demais usam recibo e número quando disponível. Evidência explícita varia por portal. Ambiguidade, vínculo compartilhado, divergência ou consulta parcial mantêm pendente, com motivo.

**Distinção central:** o worker analisado grava resultados em `easy_pague_consultas`; não executa baixa em `parcelas_acordo`. `Pendente` significa ausência de confirmação suficiente nessa consulta, não prova de inadimplemento. `Concluido` significa fim da consulta, não pagamento confirmado de todos os alvos.

`GET /api/easy-pague/planilha?administradora=<id>` exporta XLSX apenas de alvos não confirmados. Colunas incluem condomínio, bloco, unidade, acordo, parcela, vencimento, valor e campos de situação/data/valor pago/recibo/observação. Retorna 400 sem administradora e 404 sem pendências; resposta usa `private, no-store`. Não foi identificado neste percurso um importador da planilha preenchida.

## 9. Easy Maestro

**Observado:** painel por administradora/receita, filtrado por carteira. Início exige papel de escrita, administradora, lote UUID e seleção não vazia de condomínios UUID. A action remove IDs repetidos e solicita RPC com opção `montarFlow`.

A elegibilidade depende de receitas de inadimplência ativas, condomínio ativo, controle global, janela de cobrança e ausência de execução incompatível. A RPC serializa solicitações por trava e usa lote para idempotência. A seleção pode produzir somente o subconjunto disponível; o resultado informa número de execuções criadas.

Janela observada: usa o mês de `hoje - dias_de_inicio`, ajusta o dia de vencimento ao último dia existente nesse mês e soma os dias de início. Sem configuração explícita, considera os fallbacks do domínio. Painel inclui liberação, última captação no mês e evidência de conversão consolidada; migrations posteriores acrescentam tratamento de consolidado Living.

Estados apresentados: `disponivel`, `fila`, `captando`, `importando`, `importado`, `sem_inadimplencia`, `revisar`. São uma projeção de execução, conversão e montagem; `importado` não comprova envio. Montagem possui estados próprios `pendente`, `processando`, `atencao`, `concluido`.

**Atenção a efeitos externos:** escolher montagem pode encaminhar o fluxo à automação existente. O trigger analisado enfileira ativação de flows com origem `maestro` ou `easy_maestro`, prontos e com mensagens, quando o controle da carteira está ativo. A ativação efetiva depende das demais configurações e workers. A UI deve explicar essa possibilidade antes da confirmação; a opção não deve ser descrita como garantia de mera simulação.

## 10. Arquitetura e persistência

Camadas observadas: páginas e componentes Next.js → Server Actions/Route Handlers → serviços Easy e helpers dos domínios → Supabase; jobs e workers executam captação e consultas de portal de forma assíncrona.

Versões declaradas no `package.json` do commit: Next.js 16.3.5, React 19.2.5, TypeScript 5.9.3 e Supabase JS `^2.108.1`. Dependências não estavam materializadas na raiz para confirmar instalação. Futuras alterações Next.js devem consultar a documentação da versão instalada.

| Entidade | Papel e dados relevantes |
| --- | --- |
| `carteiras`, `profiles` | Escopo e autorização |
| `condominios`, `unidades` | Identidade, regras, contatos e vínculos |
| `cobrancas` | Base operacional; status operacional/financeiro separados |
| `acordos`, `acordo_cobrancas` | Negociação e composição das cobranças |
| `parcelas_acordo` | Plano operacional de parcelas |
| `acordo_homologacoes_adm` | Documento e conferência da administradora |
| `timeline_operacional` | Eventos auditáveis |
| `conversoes_relatorio` | Prévia, origem, assinatura, snapshot e resultado |
| `easy_flow_execucoes` | Operador, plano JSON, hashes, parte, IDs dos flows, contadores e erro |
| `reguas`, `regua_etapas` | Política de comunicação |
| `integracoes_smtp_config`, `integracoes_smtp_rotas_condominio` | Conta e rota; credenciais não copiadas à execução |
| `cobranca_flows` e mensageria | Execução real de comunicação |
| `agente_receitas`, `agente_execucoes` | Captação remota, lote e opção de montagem |
| `maestro_flow_montagens`, `maestro_flow_ativacoes` | Filas de montagem e ativação |
| `easy_pague_consultas` | Alvos/resultados JSON, estado, token, tentativas e reserva |
| `scanner_configuracoes`, `scanner_controle` | Vínculo financeiro e exclusão mútua de consultas |

Não criar tabelas paralelas de acordos ou pagamentos para o Easy. `acordos_parcelas` é legado conforme orientação do projeto; os percursos analisados utilizam `parcelas_acordo`.

### Contratos principais de servidor

| Operação | Contrato observado |
| --- | --- |
| Cancelar | `cancelEasyAgreement(FormData)` → erro, sucesso, URL opcional |
| Ler/efetivar PDF | `lerParcelasPdfAdm` / `efetivarParcelasPdfAdm` → prévia/erro ou mensagem |
| Flow | `opcoesFlowEasy`, `prepararFlowEasy`, `consultarFlowEasy`, `descartarResumoFlowEasy`, `montarParteFlowEasy`, `liberarParteFlowEasy` |
| Maestro | `consultarEasyMaestro` / `captarEasyMaestro` → painel ou criadas/erro |
| Pag | `consultarEasyPague` / `solicitarEasyPague` → parcelas ou criadas/erro |
| RPC Cap | `easy_captacao_snapshot`, `easy_preparar_captacao` |
| RPC PDF | `acordo_aplicar_parcelas_pdf_adm` |
| RPC Pag | `easy_pague_administradoras`, `easy_pague_painel`, `easy_pague_solicitar`, `easy_pague_reservar` |
| RPC Maestro | `easy_maestro_painel`, `easy_maestro_captar` e helpers de janelas |

As assinaturas completas devem ser extraídas das migrations aplicáveis ao implementar clientes; existem sobrecargas e substituições históricas. Não executar migrations isoladas presumindo que representam o schema final.

### Retenção operacional da P2

No worktree P2, Cap e Flow verificam o prazo da prévia ao aplicar a primeira mutação. A manutenção por carteira compacta apenas o staging elegível. Conversões concluídas mantêm o plano assinado usado no replay e os recibos. Documentos vinculados, eventos financeiros e chaves de idempotência permanecem fora da limpeza. Os critérios de elegibilidade, prazos e comandos estão no [procedimento de retenção](easy-cob-p2-retencao.md).

## 11. Protótipo local e diferenças

**Observado:** HTML/CSS/JavaScript sem backend, com dados fictícios e `localStorage` na chave `easy-cob.demo-agreements`. O rodapé identifica demonstração. Não há autenticação, carteira, RLS, auditoria central, integração de portal ou sincronização entre usuários.

| Tema | Protótipo | Integrado |
| --- | --- | --- |
| Escopo | Quatro operações de acordo | Cinco áreas operacionais |
| Consulta | Acordo local mais recente com simulação ou dado demonstrativo | Seleção de acordos e parcelas canônicas |
| Cálculo | Soma de cotas mais despesa fixa; divisão em centavos | Cálculo compartilhado, despesas percentuais, custos e juros |
| Parcelamento | 2 a 120 pela UI; mensal com ajuste ao fim do mês | Limites/regras do domínio e aprovação do síndico |
| Efetivação | CSV `parcela;vencimento;valor`, salvo como `parcels` | PDF, conferência e RPC transacional |
| Cancelamento | Motivo e anexo genérico até 2.000.000 bytes, em Data URL local | PDF privado, trilha e regras financeiras |
| Minuta | TXT; download sem criação | TXT de simulação e demais fluxos no domínio GKLI |
| Concorrência | Releitura local antes de salvar; sem transação entre abas | Revalidações, índices, travas e limites explicitados acima |

O CSV do protótipo exige cabeçalho exato, parcela inteira positiva única, data DD/MM/AAAA válida e valor positivo com vírgula e duas casas. Não compara o total importado ao simulado, nem exige sequência contígua ou ordem temporal. Essas permissividades não devem ser promovidas a regra de produção.

O protótipo distribui centavos restantes entre as primeiras parcelas e ajusta meses curtos sem deslocar o dia de referência dos meses seguintes. Sua consulta não oferece seleção completa de múltiplos acordos. Anexos em localStorage consomem cota do navegador e não representam armazenamento seguro de produção. Ele serve como referência de interação, não como especificação financeira canônica.

## 12. Requisitos não funcionais e operação

- **Integridade:** cálculo em centavos ou precisão decimal equivalente; valor ausente obrigatório não vira zero; estados operacionais e financeiros mantidos separados.
- **Concorrência:** repetição não duplica efeitos; resposta interrompida requer consulta por ID e reconciliação antes de nova mutação.
- **Auditoria:** registrar usuário, carteira, origem, entidade, instante, decisão, antes/depois e correlação quando aplicável; evitar documento/contato completo em logs.
- **Privacidade:** anexos privados e URLs temporárias; credenciais exclusivamente no servidor/worker. Revisar logs que propagam objetos de erro e mensagens de banco.
- **Escala:** manter paginação e limites observados; não truncar silenciosamente. Acima dos limites, oferecer encaminhamento ao painel completo.
- **Observabilidade:** correlacionar conversão, execução Easy, Flow, mensagem e job; distinguir falha, ausência de evidência e resultado incerto.
- **Operação:** informar quantidade solicitada/aceita/processada e motivos de exclusão. Explicitar espera de worker e não anunciar conclusão só porque o pedido entrou na fila.
- **Recuperação:** preservar histórico, impedir repetição cega e oferecer procedimento por execução para captação parcial, Flow interrompido e consulta vencida.
- **Desempenho:** a [medição P2](easy-cob-p2-desempenho.md) registra latência, tamanho de partes, espera na fila e recuperação em laboratório. O SLA do ambiente alvo permanece em aberto. A [política de retenção](easy-cob-p2-retencao.md) define os prazos das prévias e dos temporários.

## 13. Critérios de aceite para homologação

Os cenários abaixo são propostos; não foram executados nesta tarefa.

| ID | Cenário | Resultado esperado |
| --- | --- | --- |
| AC-01 | Usuário usa ID de outra carteira em action/API | Negação sem leitura ou mutação da entidade |
| AC-02 | Duas tentativas incluem a mesma cota em acordos vigentes | Apenas vínculo permitido pelo domínio é persistido |
| AC-03 | Unidade tem acordo e outras cotas livres | Cotas livres continuam negociáveis |
| AC-04 | Parcelamento em mês curto e valor com resto de centavos | Datas válidas e soma final exata |
| AC-05 | Limite de parcelas sem síndico excedido | Encaminhamento à aprovação sem contornar bloqueios |
| AC-06 | Cancelamento com pagamento registrado | Bloqueio no servidor e ausência de cancelamento |
| AC-07 | PDF altera parcela paga ou remove histórico | Transação rejeitada sem atualização parcial |
| AC-08 | Repetição equivalente da efetivação do PDF | Nenhuma duplicação de plano ou homologação indevida |
| AC-09 | Arquivo, revisão ou assinatura muda após a prévia | Exigência de nova leitura |
| AC-10 | Captação com agente remoto ou CNPJ divergente | Bloqueio antes da substituição |
| AC-11 | Planilha tem erro em uma linha, fórmula ou contato conflitante | Nenhuma importação e erro identificável |
| AC-12 | Base muda entre prévia e confirmação | Snapshot rejeitado sem iniciar substituição |
| AC-13 | Falha de importação após preparação Easy Cap | Estado de falha e orientação de recuperação sem falso sucesso |
| AC-14 | Régua, cobrança ou contato muda antes de montar | Plano rejeitado para revisão |
| AC-15 | Montagem concluída antes de liberar | Todos os flows permanecem pausados |
| AC-16 | Falha após criar/liberar Flow e antes de salvar contador | Reconciliação identifica efeitos sem envio duplicado |
| AC-17 | Outro operador tenta usar execução Flow | Acesso recusado; conflito apresentado de forma compreensível |
| AC-18 | Pag recebe evidência ambígua ou pagamento fora do corte | Resultado pendente, sem baixa automática |
| AC-19 | Pag confirma evidência inequívoca | Resultado confirmado na consulta; parcela não baixada por esse worker |
| AC-20 | Pedidos Pag repetidos no mesmo corte | Sem duplicação por configuração/unidade/corte |
| AC-21 | Maestro recebe lote repetido, seleção parcial ou automação desligada | Sem duplicação; contagem real ou erro claro |
| AC-22 | Maestro monta com ativação automática configurada | Interface informa efeito e auditoria permite seguir até a mensagem |
| AC-23 | Exportação Pag sem pendências ou administradora | 404 ou 400; sem arquivo enganoso |
| AC-24 | Navegação por teclado e tela estreita | Controles acessíveis, foco e tabelas utilizáveis |

## 14. Lacunas e prioridades

| Prioridade | Achado/decisão | Encaminhamento |
| --- | --- | --- |
| P0 | Substituição Cap e importação sem transação global | Definir estratégia de staging, compensação ou retomada auditada; ensaiar falha parcial |
| P0 | Flow com efeitos distribuídos e resultado incerto | Reconciliação por execução/Flow, idempotência e recuperação de estados interrompidos |
| P1 | Cancelamento distribuído, anexo anterior ao resultado e filtros de estado diferentes | Unificar elegibilidade e garantir atomicidade ou recuperação explícita |
| P1 | Nova montagem possível após `atencao` | Exigir conferência das mensagens/flows existentes antes de repetir |
| P1 | Montagem Maestro pode resultar em ativação automática | Tornar consequência visível na confirmação e validar configuração por carteira |
| P1 | Resultado Pag pode ser interpretado como baixa | Ajustar textos e definir ponte humana/auditada para conciliação |
| P1 | Dependência de worker sem prova de disponibilidade | Expor heartbeat, fila, último processamento e alerta de atraso |
| P2 | Protótipo diverge em despesas, CSV, estados e armazenamento | Manter o modo demonstração. Uma eventual integração exige contratos canônicos. |
| P2 | Homologação jurídica da minuta e formato final não definidos | Definir template, versão, assinatura e trilha de aceite |
| P2 | Retenção, expiração de prévias, SLAs e retomada administrativa não definidos | Aprovar política operacional e critérios mensuráveis |

Prioridades são avaliação técnica desta análise, não incidentes confirmados em produção. Antes de implementar, conferir schema efetivamente aplicado, helpers completos, testes existentes e documentação específica do domínio.

## 15. Rastreabilidade e continuidade

Fontes principais no commit analisado:

- Entrada, navegação e actions: `app/app/configuracoes/easy/**` e `features/easy-cob/legacy.ts`.
- Acordos: `features/acordos/easy-disponibilidade.ts`, `features/acordos/actions.ts`, `features/acordos/pdf-parcelas-actions.ts`, `components/acordos/acordo-simulator-form.tsx`, `app/app/acordos/novo/page.tsx`.
- Captação: `app/api/easy-cob/captacao/route.ts`, `app/api/conversao-relatorio/confirmar/route.ts`, `features/easy-cob/captacao-{server,preview,assinatura}.ts`, `features/easy-cob/planilha-manual.ts`.
- Flow: `features/easy-cob/flow-{server,model}.ts`, `features/flows/cobranca/dividir-criacao.ts`, actions Easy e migrations SMTP.
- Pag: `features/easy-cob/pague-server.ts`, `app/api/easy-pague/planilha/route.ts`, `scripts/scanner/easy-pague-{worker,resultado}.mjs`.
- Schema: migrations `20261108022636_easy_acordo_parcelas_pdf.sql`, `20261108132205_easy_captacao_maestro.sql`, `20261108142307_easy_flow_smtp.sql`, `20261109112259_easy_maestro.sql`, `20261109190919_easy_pague.sql` e evoluções Easy Maestro de 09–10/11/2026.
- Validadores existentes identificados, não executados: `scripts/validate-easy-{captacao,disponibilidade,flow,pdf-parcelas,planilha-manual,valores}.ts` e `scripts/scanner/easy-pague-resultado.test.mjs`.

Achados sobre as datas, o histórico do consolidado e as fontes do Espelhar no painel do Maestro estão no [registro de estados e melhorias](easy-maestro-estados-e-melhorias.md).

### Diagnóstico de coleta no Easy Espelhar

Quando o coletor registra uma falha de conexão ou um tempo limite de navegação, o painel orienta a conferir o acesso ao portal ou repetir **Só conferir** após o portal responder. Se a coleta chegou a produzir um relatório, mas o conversor recusou o formato ou o conteúdo, o aviso orienta a conferir o arquivo. Erros desconhecidos conservam o aviso da etapa. Nas execuções antigas com aviso genérico, o painel consulta a fonte vinculada ao pedido para recuperar uma causa reconhecida. Apenas a mensagem pública é enviada ao navegador.

### Limpeza diária da fila de captação

Em Configurações → Automação → Limpeza da fila do Maestro, administradores podem pausar ou ativar a rotina global e consultar o horário e o total da última execução. O job do banco processa Maestro e Easy Maestro às 06h de Brasília. Usa a data de criação e o agendamento do pedido em relação ao corte, respeita tentativas e evidências da coleta e registra cada cancelamento no histórico da execução e na auditoria. A pausa também se aplica a dias sem pedidos. Reativar permite a próxima execução agendada.

Para continuar em outro chat: objetivo é evoluir o módulo integrado preservando os domínios GKLI; esta especificação é a base inicial. Confirmar o novo HEAD e o checkout antes de alterar código. Permanecem pendentes homologação dos cenários, inspeção da configuração implantada e decisões da seção 14. Nenhuma autorização de deploy, migration, execução de worker ou envio decorre deste documento.
