# Easy Cob — plano de correções e melhorias

Data: 18/11/2026. Base analisada: commit `871a57d4` e `docs/especificacao-easy-cob.md`.
Estado: implementação local em `codex/easy-p0-contencao`. E0 e contenção estão registrados em [E0 e contenção](easy-cob-e0-contencao.md). [P0-B](easy-cap-p0b-transacional.md) e [P0-C](easy-flow-p0c-transacional.md) têm implementação local e verificação em fixtures. Migrations preparadas, sem implantação ou operação em produção. A homologação integral de schema, concorrência e workers continua pendente; P0 ainda não está homologado para implantação.

Preparação posterior: [candidata à publicação P0](easy-p0-publicacao.md), branch `codex/easy-p0-publicacao`, sobre a `main` `c36d4e93`, preservando a implementação original em commit local. Inclui compatibilidade com marcadores manuais/ciclo atuais, manifesto, diagnósticos somente leitura, build e descrição do PR; sem publicação remota.

## 1. Resultado esperado e ordem

A primeira entrega deve eliminar as janelas em que uma falha pode deixar a base substituída sem os novos dados ou permitir repetição de montagem/liberação com efeitos desconhecidos. Melhorias de experiência vêm depois dessas garantias.

| Ordem | Frente | Prioridade | Resultado de conclusão |
| --- | --- | --- | --- |
| 0 | Confirmar baseline e contratos dos domínios | Pré-requisito | Código executável e mapa dos efeitos atuais |
| 1 | Conter repetição insegura e identificar operações | P0 | Resultado incerto bloqueia novas mutações conflitantes |
| 2 | Tornar Easy Cap transacional | P0 | Falha antes do commit preserva a base; repetição após commit retorna o resultado |
| 3 | Tornar montagem e liberação Flow recuperáveis | P0 | Cada efeito é identificável; retomada não duplica trabalho |
| 4 | Corrigir cancelamento e autorização de ativação Maestro | P1 | Operações coerentes, auditadas e com efeito explícito |
| 5 | Melhorar Pag, disponibilidade dos workers e recuperação operacional | P1 | Operador distingue consulta, baixa, fila e falha |
| 6 | Consolidar experiência, documentos e políticas | P2 | Interface e documentação coerentes com os contratos |

O bloqueio de nova montagem após `atencao`, antes classificado isoladamente como P1, integra a contenção P0: sem ele, a recuperação do Flow continua permitindo repetição insegura.

## 2. Condições para começar a implementação

O checkout atual contém muitos arquivos removidos, inclusive fontes principais e configuração da aplicação. Não restaurar ou sobrescrever essas mudanças. Antes do primeiro patch de código, localizar o checkout executável adotado pelo projeto ou preparar uma cópia isolada da referência acordada, preservando o diretório atual. Validar diferenças posteriores ao commit analisado.

Ler a documentação Next.js da versão instalada antes de alterar páginas/actions. Para implementação Supabase, conferir documentação vigente e schema alvo, sem presumir que todas as migrations do Git foram aplicadas. A execução remota requer escopo próprio; esse plano autoriza apenas sua elaboração.

Revisar integralmente os caminhos compartilhados afetados: importador, cancelamento, motor de régua, consolidação de mensagens, criação de lote/Flow e ativação. Identificar triggers, filas e efeitos de Storage. Definir onde cada operação começa e termina no banco.

**Entrega E0:** mapa curto de transações, efeitos externos, permissões e diferenças do schema. Concluir com fixtures sintéticas e um ambiente isolado com envio real desabilitado. Não copiar dados ou credenciais de produção para fixtures.

## 3. P0-A — contenção e identificação

### Trabalho

1. Definir contrato de execução: ID estável, carteira, condomínio, operador, tipo de operação, versão do plano, estado, tentativa, erro classificado e resultado persistido.
2. Separar erro sem efeito, execução em andamento, resultado confirmado e resultado incerto. Timeout de HTTP não significa falha da operação no banco.
3. Em Easy Cap e Flow, consultar a execução existente antes de oferecer nova confirmação; uma operação conflitante precisa ser resolvida antes de começar outra.
4. Incluir `atencao` não resolvido na proteção contra nova montagem. Antes de ampliar índice único, levantar duplicidades existentes; não alterar estado ou cancelar flows automaticamente para fazer o índice passar.
5. Criar consulta de diagnóstico somente leitura por execução. Mostrar último estado, instante, efeitos conhecidos e orientação de recuperação.
6. Definir política de retomada: operador consulta a própria execução; retomada por gestor/admin exige carteira permitida e evento de auditoria. Não ampliar permissão de escrita implicitamente.

### Cuidados

Bloqueio apenas na interface é insuficiente. A exclusão mútua deve existir no banco e abranger chamadas concorrentes por outros percursos que mutam as mesmas cobranças/canais. Sem correlação histórica, similaridade de datas e valores é indício, não autorização para atribuir um Flow a uma execução antiga.

**Aceite:** duplo clique, duas abas e dois operadores não iniciam operações conflitantes; erro de rede leva à consulta do resultado; execução em atenção permanece bloqueante até decisão auditada. Contenção não será apresentada como solução definitiva de atomicidade.

## 4. P0-B — Easy Cap sem substituição parcial

### Decisão técnica proposta

Preparar e validar todos os novos lançamentos antes de modificar a base operacional. Aplicar substituição, inserções, ajustes de mensagens/filas, resultado e conclusão da conversão em uma única transação Postgres. Evitar compensação automática que tente reconstruir a base depois de removê-la.

Há precedente em `maestro_substituir_captacao`, na migration `20261110131531_substituir_cobrancas_maestro_preservar_historico.sql`. Essa função exige origem e marcadores específicos do Maestro e possui critérios diferentes do snapshot Easy. **Não chamá-la diretamente com origem adulterada nem trocar o Easy pelo recorte Maestro.** Extrair um núcleo comum ou criar wrapper dedicado com política explícita, após revisar dependências.

### Etapas

1. Documentar em fixtures o conjunto substituível Easy: ano, estados, vínculos, duplicadas, pagamentos, judicialização, bloqueios e histórico. Resolver divergências entre snapshot e rotina efetiva antes da implementação.
2. Extrair a preparação do importador para produzir plano determinístico: novas cobranças, parcelas, referências de unidade, totais, preservações e efeitos sobre filas. Nenhuma remoção operacional nessa etapa.
3. Definir tratamento de unidades/contatos criados pelo importador: incluir mutações indispensáveis no commit ou declarar staging isolado. Não prometer rollback global enquanto esses efeitos ocorrerem fora da transação.
4. Persistir plano validado por conversão, com digest e versão do schema de plano. Dados preparados devem ter acesso restrito e política de retenção.
5. Implementar RPC de commit, com nome definitivo definido na implementação. Validar carteira, operador/origem, assinatura conferida no servidor, estado, completude, totais e versão do plano; não aceitar arrays arbitrários do navegador como plano confiável.
6. Adquirir travas em ordem consistente com os outros escritores; recalcular o conjunto substituível e a versão dentro da transação. Revalidar acordos, pagamentos e mensagens em envio. Validar também a serialização com outros percursos de importação.
7. Aplicar mutações e auditoria, gravar contadores/resultado e estado final da conversão na mesma transação. Falha em auditoria obrigatória aborta o commit.
8. Idempotência por conversão e digest: repetição equivalente retorna resultado persistido; plano diferente sob a mesma chave é rejeitado. Duas conversões concorrentes usam a versão da base para impedir aplicação obsoleta.
9. Adaptar `/api/conversao-relatorio/confirmar` somente para o caminho Easy, retirando a preparação destrutiva antecipada. Preservar contratos de resposta e compatibilidade dos demais importadores.
10. Alterar UI para consultar o resultado após interrupção e exigir nova prévia quando a base tiver mudado.

### Arquivos e dependências

`app/api/conversao-relatorio/confirmar/route.ts`, `features/easy-cob/captacao-server.ts`, `captacao-preview.ts`, `captacao-assinatura.ts`, UI `captacao/upload.tsx`, helpers de importação e novas migrations. Funções de substituição Maestro são referência e possível ponto de extração, não autorização para modificar todos os agentes nesta entrega.

### Aceite e falhas a injetar

- Erro em qualquer inserção ou auditoria: nenhuma substituição, cancelamento de mensagem ou atualização financeira parcial fica confirmada.
- Queda depois do commit e antes da resposta: a mesma conversão retorna sucesso anterior, sem duplicar cobranças/parcelas.
- Pagamento/acordo criado entre prévia e confirmação: commit obsoleto é rejeitado sem mutação.
- Mensagem em envio: bloqueio seguro conforme o domínio; não forçar cancelamento.
- Relatório parcial, duplicado, com total divergente ou carteira incorreta: rejeição antes de modificar a base.
- Testar tamanho máximo suportado e concorrência; se uma transação não couber no orçamento do runtime, preparar em staging e executar commit curto. Não dividir o commit destrutivo em lotes independentes.

Relaciona-se a AC-01, AC-09–AC-13 da especificação. AC-13 deverá evoluir de “registrar falha parcial” para “impedir efeito operacional parcial no novo percurso”.

## 5. P0-C — Flow idempotente e recuperável

### Decisão técnica proposta

Registrar identidade da operação antes do primeiro efeito. Usar chaves únicas por execução/parte e por execução/Flow/liberação; correlacionar lote, itens, mensagens e flows desde sua criação. `flow_ids` preenchido no fim não é suficiente para recuperar uma resposta interrompida.

### Montagem

1. Mapear cada escrita de `criarFlowsCobranca`, `processarReguaCobranca` e consolidações por canal. Definir a unidade de idempotência antes de introduzir retry.
2. Criar registro durável por parte e chave determinística `(execucao, indice_da_parte, versao_do_plano)`. Propagar essa identidade aos artefatos com constraints apropriadas. Preservar IDs existentes ao repetir a mesma operação.
3. Atualizar estado das cobranças, criar artefatos pausados, registrar vínculos e concluir a parte na mesma transação quando viável. Se o motor exigir etapas, cada etapa deve ser idempotente e ter resultado persistido; publicação para envio só pode ocorrer após a montagem completa.
4. Validar sobreposição de cobranças/canais sob a mesma proteção usada pelos demais criadores de Flow, inclusive painel completo e Maestro. Um índice por condomínio Easy sozinho não resolve concorrência entre percursos.
5. Incorporar ao plano as configurações que afetam elegibilidade, contatos e transporte; revalidá-las sob a proteção do commit. Considerar que a promoção de status feita pela própria execução altera hashes antigos; diferenciar mudança própria de alteração externa.
6. Para trabalho mutável dividido em etapas, registrar claim com token de posse, versão monotônica e lease. Na implementação local P0-C, a parte inteira foi trazida para uma transação: a trava transacional mantém a posse até commit/rollback, sem trabalhador continuando gravações parciais. A preparação anterior é somente leitura. A decisão e os limites estão no relatório P0-C; se surgirem efeitos persistidos fora da transação, implementar o protocolo de token/versão/lease antes de habilitar retomada.

### Liberação

1. Revisar `enviarFlowCobranca` e `email_ativar_flow`; fazer ativação/agendamento e recibo durável de liberação na mesma transação, ou usar comando/outbox transacional com consumidor idempotente.
2. Repetir chave já concluída deve retornar recibo anterior. Não inferir sucesso apenas do status agregado do Flow; usar evidência de ativação e mensagens.
3. Revalidar elegibilidade, canais, destinatários, régua, SMTP e bloqueios na liberação, sem depender só da disponibilidade da conta.
4. Separar claramente montagem, liberação, agendamento, tentativa e entrega. Liberação não deve reenviar mensagem já entregue.
5. Não prometer entrega externa exatamente uma vez: quando o provider aceitar e a resposta se perder, preservar estado incerto e reconciliar pelo identificador disponível. Sem evidência suficiente, impedir reenvio automático.

### Reconciliação e retomada

Implementar reconciliador por execução que leia registros de partes, flows, mensagens, agenda e comandos de ativação. Deve reconstruir contadores a partir das evidências, concluir trabalho já confirmado, retomar apenas etapas comprovadamente não aplicadas e encaminhar ambiguidades para revisão.

Lease vencido permite investigar, não presume ausência de efeito nem autoriza repetir envio. A liberação da trava de negócio depende da reconciliação. Para histórico sem correlação, produzir diagnóstico e exigir decisão auditada; não preencher vínculos por aproximação.

### Arquivos e aceite

Arquivos: `app/app/configuracoes/easy/flow/actions.ts`, `wizard.tsx`, `features/easy-cob/flow-server.ts`, `flow-model.ts`, `features/flows/cobranca/actions.ts`, motor de régua/consolidações, RPC de ativação e migrations de execução/vínculos.

Injetar queda depois de criar lote, consolidar mensagens, criar Flow, ativar agenda e antes de salvar contadores. Em cada ponto: nenhuma duplicação ao retomar, nenhuma liberação durante montagem, nenhuma execução nova conflitante, nenhuma conclusão por trabalhador sem posse válida. Cobrir disputa com painel completo e Maestro, retirada de contato, mudança de régua, SMTP desativado e pagamento após a prévia. Relaciona-se a AC-01, AC-14–AC-17 e AC-22.

## 6. P1 — consistência operacional

Implementação local em 19/11/2026: ver [entrega e verificação P1](easy-cob-p1-consistencia.md). O anexo foi incorporado ao repositório privado transacional existente, eliminando a necessidade de staging/limpeza deste percurso. Implantação e homologação multi-sessão permanecem separadas da implementação.

| Item | Implementação | Dependência | Aceite |
| --- | --- | --- | --- |
| Cancelamento transacional | Centralizar elegibilidade; executar alterações de acordo, termos, parcelas, cobranças e auditoria em RPC; conferir erros de todas as escritas | Mapa completo do cancelamento e das filas | Pagamento concorrente impede cancelamento; falha reverte mutações; `renegociado` tratado igualmente na UI e servidor |
| Anexo do cancelamento | Upload privado temporário por operação; vincular no commit; limpeza idempotente de órfãos com prazo de segurança | Contrato transacional de cancelamento | Falha não apresenta anexo como prova de cancelamento; limpeza não apaga documento referenciado |
| Maestro com efeito explícito | Mostrar captar, montar e eventual ativação automática conforme configuração; persistir versão/consentimento da solicitação e revalidar ao executar | Política de ativação e controles existentes | Mudança de configuração não amplia silenciosamente o efeito aceito; lote repetido não duplica |
| Pag sem falsa baixa | Textos distintos para consulta concluída, confirmação encontrada e parcela baixada; mostrar corte e evidência; encaminhar conciliação ao domínio existente | Nenhuma mudança de baixa automática | Confirmado na consulta não muda parcela; pendente não afirma falta de pagamento |
| Saúde dos workers | Heartbeat sem segredos, idade da fila, execução mais antiga, tentativas, último sucesso e falha; estados para indisponibilidade | Identidade de execução e contrato de worker | Painel diferencia pedido aceito de processamento; alerta usa limiar configurado e mostra origem |
| Recuperação administrativa | Ações restritas por carteira, motivo obrigatório e comparação de versão; aproveitar reconciliador P0 | P0-C | Gestor não consegue forçar envio ou apagar histórico ao “destravar” |
| Autorização e logs | Revisar todos os caminhos administrativos, RPCs, grants, filtros e URLs de anexos; padronizar erros sem documentos/contatos | E0 | Casos entre carteiras negados em actions, APIs e RPCs acessíveis |

Critérios relacionados: AC-01–AC-08, AC-18–AC-23. Não adicionar importação de planilha de pagamentos ou baixa automática como extensão implícita desta frente.

## 7. P2 — experiência e manutenção

1. Consolidar status, mensagens de erro, foco, acessibilidade, telas estreitas e links de continuidade. Priorizar compreensão de pendências e resultados parciais sobre mudanças visuais amplas.
2. Manter protótipo `esay-cob` explicitamente demonstrativo. Se for integrado, substituir armazenamento local por contratos canônicos e retirar divergências financeiras; não migrar dados demonstrativos para o banco.
3. Definir minuta e documento final com responsável de negócio/jurídico: template versionado, campos obrigatórios, formato, assinatura e distinção entre simulação e aceite. Esse acordo é dependência da implementação documental, não dos P0.
4. Definir retenção e expiração de prévias/staging/anexos temporários; manter resultados e chaves idempotentes pelo período necessário para impedir repetição tardia. Expirar prévia não autoriza apagar evidência financeira.
5. Medir antes de definir SLA: latência de prévia/commit, tamanho das partes, espera de worker e taxa de recuperação. Estabelecer limites com base no ambiente alvo.
6. Atualizar especificação, contratos, procedimentos de recuperação e matriz de compatibilidade das migrations após cada entrega.

## 8. Pacotes de entrega e dependências

| Pacote | Escopo revisável | Depende de |
| --- | --- | --- |
| PR-0 | Baseline, fixtures e mapa dos efeitos | Checkout isolado executável |
| PR-1 | Contenção, estados incertos e diagnóstico somente leitura | PR-0 |
| PR-2 | Plano preparado e RPC transacional Easy Cap, sem troca do consumidor | PR-0 e contrato de preservação |
| PR-3 | API/UI Easy Cap no novo commit, recuperação por ID | PR-1 e PR-2 |
| PR-4 | Chaves/vínculos/posse e criação Flow idempotente | PR-0 e revisão do motor compartilhado |
| PR-5 | Liberação com recibo, reconciliador e retomada Flow | PR-1 e PR-4 |
| PR-6 | Cancelamento/anexos transacionais | Mapa do domínio e testes de concorrência |
| PR-7 | Maestro, Pag e saúde operacional | Contratos estabilizados; reconciliador para retomadas |
| PR-8 | Experiência, minuta e políticas de retenção | Decisões de produto e P0 aprovados na homologação |

Os pacotes descrevem separação de revisão, não instruem criação automática de PRs. A sequência recomendada é PR-0 → PR-1 → PR-2 → PR-3 → PR-4 → PR-5, encerrando P0 antes da expansão P1/P2. Se houver capacidade de equipe, preparar desenho de Flow durante Cap sem compartilhar patches ou migrations conflitantes.

Não fixar prazo de calendário antes de E0: o checkout e a extensão dos efeitos no motor compartilhado ainda precisam ser confirmados. O marco de P0 depende da prova de integridade e recuperação, não apenas do merge das actions.

## 9. Verificação necessária por entrega

Executar testes dirigidos aos riscos alterados: integração Postgres com rollback e constraints reais, concorrência entre sessões e injeção de falhas nas fronteiras de commit. Mocks isolados não provam atomicidade ou exclusão mútua. Reaproveitar validadores existentes quando cobrem a regra; evitar testes que apenas reproduzam a implementação.

Após mudanças Next.js/TypeScript, executar verificações estáticas adequadas no checkout executável. Build só após conferir o `prebuild`, pois o projeto inclui geração de snapshot de schema. Não executar comandos linked ou workers com envio real como parte automática do teste.

Para fechar P0, registrar evidências de: base preservada em rollback, resultado recuperado após perda de resposta, nenhuma duplicação em corrida, nenhuma mensagem liberada na montagem e bloqueio de reenvio incerto. Confirmar que os caminhos GKLI compartilhados continuam funcionando.

## 10. Implantação e reversão

Preparar migrations aditivas e compatíveis antes de mudar consumidores. Validar constraints novas sobre dados existentes por diagnóstico; não fazer backfill destrutivo. Adotar controle de habilitação do novo caminho por ambiente/carteira, com padrão de envio desabilitado na homologação.

Roteiro de implantação futura: conferir schema/versões e recuperação disponível → aplicar estruturas compatíveis → publicar consumidores compatíveis → homologar com dados sintéticos → habilitar carteira piloto no escopo autorizado → observar resultados e só então ampliar.

Se houver falha, desabilitar novas mutações do caminho afetado e preservar consultas/reconciliação. **Não reativar automaticamente o caminho antigo de substituição destrutiva ou retry inseguro.** Rollback de aplicação não deve apagar migrations, resultados ou chaves idempotentes necessários para explicar operações já confirmadas. Mensagem já enviada não pode ser revertida por rollback de banco.

Autorizações de produção serão tratadas no contexto concreto da implantação, com ambiente e operações definidos. Nenhuma ação de produção foi necessária para elaborar este plano.

## 11. Próxima tarefa executável

Começar por E0/PR-0: estabelecer checkout isolado, ler o importador e o motor de Flow completos, fechar a matriz de preservação Easy Cap e documentar os pontos exatos de commit. Depois implementar PR-1, a contenção de repetição insegura. A entrega seguinte é a preparação e aplicação transacional do Easy Cap, seguida da idempotência e reconciliação de Flow.

### P2 iniciada — navegação do módulo e estados do Easy Pag

No mesmo worktree, a branch local `codex/easy-p2-experiencia` parte da candidata conjunta `4c971239`. O menu do Easy inclui Cobranças, identifica a seção atual e recolhe os destinos em telas menores que 768 px. O atalho para o conteúdo evita percorrer o menu pelo teclado. O indicador de etapas informa a posição e as etapas concluídas a leitores de tela. No Pag, uma falha de leitura permite atualizar a lista mantendo a administradora. Se o pedido perde a resposta, o painel consulta novamente o estado das parcelas. Uma atualização indisponível identifica a última leitura e bloqueia nova solicitação até a conferência.

Validação de interação em Chrome local a 320 e 1200 px com componentes reais e serviços simulados: menu pelo teclado, seção atual, erro inicial de leitura, atualização sem novo pedido e resposta interrompida. O ensaio não utilizou autenticação ou serviços de produção. As outras frentes P2 continuam no plano.

### P2 — Easy Cap, Easy Flow e Maestro

Easy Cap diferencia confirmação em curso e consulta de recibo. O texto de retomada depende do estado retornado: somente uma prévia recuperável oferece retomar a mesma confirmação. A tabela de amostra permite foco pelo teclado e as ações da confirmação ficam empilhadas no celular.

Easy Flow identifica a etapa de montagem parcial, apresenta o estado em português e oferece o monitor para execuções legadas. A interface usa o protocolo já consultado no servidor para ocultar ações incompatíveis. Easy Maestro distingue a conferência de efeitos do registro do pedido, informa quando a leitura está desatualizada e permite consultar novamente o andamento sem criar outro pedido. Em telas pequenas, seletor, ação e estados das coletas ficam em linhas separadas.

Verificação local em Chrome, largura de 320 px, com componentes reais e serviços simulados: consulta anterior do Cap pelo teclado, Flow legado pronto com acesso ao monitor e sem botão de liberação, falha do Maestro seguida de releitura. As suítes de fronteira de Cap, Flow, contenção e Maestro cobriram perda de resposta, recuperação pelo mesmo ID e consentimento. Nenhuma migration ou publicação faz parte desta etapa.

### P2 — Acordos, Cobranças e Espelhar

A seleção de unidade em Acordos e Cobranças explica quando falta escolher o condomínio e quando a carteira ou a operação não tem opções. A revisão do cancelamento empilha as ações no celular e anuncia separadamente o registro e a consulta do resultado. A tabela de parcelas pode receber foco para rolagem pelo teclado.

Cobranças identifica as situações operacional e financeira e sinaliza valor ou vencimento ausente. A exclusão explica bloqueios conhecidos e mantém disponível a consulta da mesma unidade quando a resposta é inconclusiva. Uma falha de atualização do cache após a confirmação da RPC preserva o resultado confirmado.

Espelhar mantém a confirmação do pedido se a leitura seguinte falhar. O painel identifica a lista desatualizada, permite consultar novamente e habilita novos pedidos após uma leitura bem-sucedida. A seleção e as ações principais ficam em linhas separadas no celular.

Verificação em Chrome local a 320 px com componentes reais, dados sintéticos e ações simuladas. O ensaio cobriu consulta de cancelamento pelo teclado, resposta interrompida na exclusão e falha de leitura após o aceite da conferência, com contagem de envios. Os testes de fronteira e de arquivamento usam dependências isoladas e PGlite.

### Revisão da P2 — simulação de acordo e pendências

| Item da seção 7 | Situação no worktree | Continuidade |
| --- | --- | --- |
| 1. Experiência | Entregas locais nos módulos listados acima e na revisão da simulação. | A conferência administrativa de Flows agora identifica a última leitura e bloqueia a reconciliação após resposta inconclusiva. Consultar novamente é uma operação de leitura. A repetição com a mesma versão e motivo reutiliza a chave do pedido. |
| 2. Protótipo | O rodapé do `esay-cob` identifica o modo demonstração e orienta usar dados fictícios. | Manter a demonstração externa ao módulo operacional. Qualquer integração futura depende dos contratos canônicos. |
| 3. Documentos | O simulador Easy baixa `simulacao-de-acordo.txt` com as condições revisadas e identifica a prévia no próprio arquivo. | Negócio e jurídico devem definir o responsável pelo modelo final, a versão, os campos obrigatórios, o formato, os signatários e a evidência de aceite. |
| 4. Retenção | [Implementada e validada localmente](easy-cob-p2-retencao.md). Sete dias para prévias elegíveis e 24 horas para temporários identificados de workers encerrados. | Para publicação futura, definir cadência e responsável pela manutenção por carteira. Artefatos legados sem comprovação de origem temporária exigem conferência manual. |
| 5. Medidas e SLA | [Ensaio P2 concluído em PostgreSQL 17 isolado](easy-cob-p2-desempenho.md), com prévia e confirmação do Cap, partes do Flow, espera na fila do Maestro e recuperação após commit. | Calibrar carga e capacidade do ambiente alvo antes de pactuar SLA. |
| 6. Documentação | Especificação e plano atualizados nesta entrega de interface. | Revisar contratos, recuperação e compatibilidade a cada mudança correspondente. Esta entrega usa o schema já previsto pela P1. |

Ensaios locais em Chrome a 320 px, com dados fictícios e ações de servidor simuladas, verificaram o download por teclado, o conteúdo do TXT, o bloqueio do download durante edição e a ausência de chamadas de criação. Na recuperação administrativa, o ensaio interrompeu a resposta da reconciliação e a primeira releitura. A tela exigiu consulta bem-sucedida antes da retomada e reutilizou a mesma chave ao repetir com a mesma versão e motivo.

A [candidata de publicação da P2](easy-p2-publicacao.md) consolida o manifesto de banco, a ordem dos consumidores, as verificações da janela e as decisões de negócio e jurídico para emissão do documento final.
