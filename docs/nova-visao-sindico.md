# Nova visão do síndico — especificação e desenvolvimento

Data: 07/09/2026. Status: base implementada e Captação conectada aos relatórios históricos verificáveis e à camada histórica conciliada; demais áreas ainda não integradas.

Contrato inicial e evidências: [nova-visao-sindico-dados.md](nova-visao-sindico-dados.md).

## 1. Compromissos de escopo

- Criar uma versão independente, preservando a visão atual e suas rotas.
- Não modificar o dashboard de gestão para acomodar o novo portal.
- Aproveitar ideias da visão existente sem reutilizar automaticamente seus cálculos.
- Não exibir menu lateral.
- Entregar quatro áreas horizontais empilhadas: Captação, Cobrança em andamento, Acordos e Pendências.
- Cada área contém um pequeno dashboard recolhível e, abaixo, seus detalhes.
- A área inteira também é recolhível. O cabeçalho permanece visível com título, síntese e controle de expansão.
- Recolher o dashboard não oculta os detalhes. Reabrir a área preserva o estado do dashboard.
- Inicialmente, áreas e dashboards ficam expandidos. Filtros não mudam ao recolher conteúdo.

## 2. Condomínio e período

O topo identifica o condomínio e permite selecionar somente condomínios autorizados ao usuário. Um único período governa toda a tela, incluindo gráficos, sínteses e detalhes.

### Competência mensal

- Abertura no último ciclo mensal encerrado.
- Intervalo inclui dia 10 às 00h e exclui dia 10 às 00h do mês seguinte, no fuso America/Sao_Paulo.
- Nome da competência definido pelo mês de encerramento.
- Setembro/2026 corresponde a [10/08/2026, 10/09/2026).
- Não permitir datas avulsas nem ciclos ainda abertos.
- Em 07/09/2026, a competência padrão é agosto/2026: [10/07/2026, 10/08/2026).

### Agrupamento anual

- Reunir competências pelo ano de encerramento.
- Janeiro a dezembro de 2026 correspondem a [10/12/2025, 10/12/2026), quando todos os ciclos estiverem encerrados.
- No ano corrente, incluir apenas competências encerradas e identificar o intervalo efetivo.
- Somar movimentações; usar a posição do último fechamento para saldos.
- Contar entidades distintas quando o indicador representar unidades ou acordos únicos no ano.
- Não somar estoques mensais ou repetir a mesma captação reprocessada.
- Distinguir período sem movimentação de histórico indisponível.

## 3. Conteúdo proposto

Os indicadores abaixo serão fechados após validar a disponibilidade e a semântica dos dados.

| Área | Dashboard | Detalhes |
| --- | --- | --- |
| Captação | Valores identificados, unidades abrangidas, composição dos débitos | Unidade, competência do débito, valor captado e referência da captação |
| Cobrança em andamento | Saldo em cobrança, unidades acompanhadas, situação e faixas de atraso | Unidade, cobranças, valores, situação, último andamento e etapa |
| Acordos | Celebrados no ciclo, valores negociados, recebimentos e posição das parcelas | Unidade, acordo, datas, valores, parcelas, pagamentos e situação |
| Pendências | Quantidade por tipo e situação; destaque para itens que dependem do síndico | Descrição, unidade/acordo, data, responsável pela próxima ação e situação |

Gráficos e detalhes devem reconciliar. As listas completas serão acessíveis por paginação ou expansão. A seção Pendências inicialmente acompanha itens; novos mecanismos de aprovação ou assinatura não fazem parte desta entrega.

## 4. Regra histórica

Separar movimentações ocorridas no ciclo da posição no encerramento. Nunca apresentar status atual como se fosse histórico.

Na captação, a base `cobrancas` é operacional e pode ser limpa e recarregada a cada nova entrada. Por isso, o fechamento do ciclo precisa persistir uma fotografia em `captacao_historica_sindico`. A visão do síndico consulta essa fotografia para ciclos fechados e não depende da permanência das cobranças atuais.

Para cada indicador, registrar: definição, fonte, campo de data, critérios de inclusão/exclusão, deduplicação, tratamento de cancelamento/estorno, agregação anual e cobertura histórica.

Investigar se eventos, pagamentos e dados de importação permitem reconstruir os fechamentos. Se for necessário persistir posições de fechamento, definir a estrutura e a estratégia antes de criar migrações. Não inventar retroativamente valores ausentes. Indicadores sem histórico confiável devem indicar indisponibilidade, sem assumir zero.

Pendências de uma competência antiga refletem o fechamento escolhido; ações futuras sobre elas precisarão revalidar o estado atual.

## 5. Organização técnica proposta

- Nova rota: `/sindico/visao-v2`, sem redirecionar `/sindico`.
- Página: `app/sindico/visao-v2/page.tsx`.
- Regras e consultas: `features/sindico-v2/`.
- Componentes próprios: `components/sindico-v2/`.
- Manter as páginas `app/sindico/page.tsx` e `app/app/gestao/visao-sindico/page.tsx` preservadas.
- Reutilizar componentes visuais genéricos quando adequados, sem alterar seu comportamento global.
- Conferir o layout e a autenticação herdados antes de integrar a nova rota.
- Validar usuário e vínculo ativos no servidor, inclusive quando houver consultas com cliente administrativo. Não confiar no condomínio recebido pela URL.
- Não expor documentos, dados de contato ou observações internas sem necessidade para a visão do síndico.

### Fontes locais para investigação

| Domínio | Referências existentes | Verificação necessária |
| --- | --- | --- |
| Acesso | `features/sindico/portal.ts`, migração `20260629160000_portal_sindico_auth.sql` | Status de usuário/vínculo, perfil e isolamento por condomínio |
| Captação | `features/captacao-automatizada/processar-relatorio.ts`, `features/condominios/queries.ts`, `conversoes_relatorio`, `captacao_historica_sindico` | Captação confirmada versus tentativa, histórico, reprocessamentos e abrangência manual/automática |
| Cobrança | `cobrancas`, `lib/core/cobranca-status.ts` | Status financeiro/operacional, saldos e cobranças vinculadas a acordos |
| Acordos e recebimentos | `features/acordos/`, `features/fechamento/`, documentação de fonte de verdade | Parcelas canônicas, pagamentos efetivos, estornos e posição histórica |
| Pendências | `acordos_termos`, `pre_juridico_casos`, `features/pre-juridico/` | Aprovações, procurações, cancelamentos e responsável pela ação |
| Histórico | `features/timeline/`, `timeline_operacional`, `auditoria_eventos` | Cobertura e suficiência dos eventos para reconstruir o fechamento |

Essas referências são candidatas identificadas no código, não uma confirmação da cobertura do banco em produção.

## 6. Etapas de desenvolvimento

### Etapa 1 — Contrato dos dados e competências

- [ ] Mapear fontes e cobertura histórica dos quatro domínios.
- [ ] Documentar cada indicador conforme a seção 4.
- [ ] Definir captação válida e deduplicação de reprocessamentos.
- [ ] Definir posição histórica e eventual necessidade de persistência de fechamentos.
- [x] Implementar cálculo único de competências e consolidação anual.
- [x] Implementar autorização de usuário e condomínio para a nova versão (validação integrada com sessão real pendente).

Entrega: contrato de indicadores e regras de período verificáveis. Dependência obrigatória para conectar números reais.

### Etapa 2 — Estrutura visual isolada

- [x] Criar rota e componentes próprios, sem mudar a navegação atual.
- [x] Construir cabeçalho e seleção de condomínio/período.
- [x] Implementar as quatro áreas com os dois níveis de recolhimento.
- [x] Preparar espaços de detalhes, carregamento e erro; ausência de movimento dependerá da integração real.
- [x] Implementar teclado, foco, `aria-expanded` e leitura em celular.

Entrega: estrutura navegável para revisão. Dados de demonstração, se necessários, identificados explicitamente e separados das consultas reais.

### Etapa 3 — Captação e cobrança

- [x] Conectar o último relatório confirmado verificável de cada ciclo, com composição, detalhes paginados e cobertura explícita (posição dos débitos no relatório; não novas cobranças admitidas).
- [x] Integrar captações históricas liberadas por conciliação e gravadas na confirmação, mantendo linhas incompletas fora da visão.
- [ ] Integrar quantidade/valor efetivamente admitidos na operação e detalhes por unidade.
- [ ] Integrar posição de cobrança e andamento até o fechamento.
- [ ] Aplicar status canônicos e evitar duplicidade com acordos.
- [ ] Reconciliar sínteses, gráficos e detalhes completos.

Entrega: primeiras duas áreas com dados verificáveis.

### Etapa 4 — Acordos e pendências

- [ ] Integrar celebrações, recebimentos e posição de parcelas.
- [ ] Integrar aprovações e procurações com situação histórica disponível.
- [ ] Identificar o responsável pela próxima ação.
- [ ] Distinguir movimentações do período de itens ainda pendentes no fechamento.

Entrega: quatro áreas conectadas e coerentes com o período.

### Etapa 5 — Consolidação e revisão

- [ ] Validar anual sem duplicação de entidades ou soma de saldos mensais.
- [ ] Testar fronteira do dia 10, virada de ano e fuso horário.
- [ ] Testar usuário/vínculo inativo e tentativa de consultar condomínio não autorizado.
- [ ] Testar pagamentos posteriores ao fechamento, cancelamentos e reprocessamentos.
- [ ] Verificar listas acima do limite padrão de consulta para não truncar indicadores.
- [ ] Verificar recolhimento independente, preservação de filtros e layout móvel.
- [ ] Executar checagem de tipos e lint pertinentes; revisar as telas existentes para regressões.

Entrega: nova versão pronta para revisão funcional, com limitações históricas documentadas. Publicação ou substituição da visão existente não integra este planejamento.

## 7. Ordem de execução e conclusão

Sequência: contrato de dados → estrutura isolada → captação/cobrança → acordos/pendências → consolidação e revisão.

As regras de período, a autorização e a estrutura visual foram implementadas. A Captação já apresenta relatórios históricos verificáveis. A próxima etapa é reconstruir posições financeiras e distinguir novas cobranças admitidas dos débitos já presentes nos relatórios; nenhuma aparência de dado real deve encobrir ausência de histórico.

Considerar concluída a entrega quando as quatro áreas funcionarem nos dois níveis de recolhimento, mensal e anual usarem ciclos completos, os números forem reconciliáveis e os acessos estiverem restritos, preservando integralmente a versão atual.
