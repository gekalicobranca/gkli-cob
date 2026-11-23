# Investigação: falhas no painel da TV em produção

**Data da investigação:** 23/11/2026
**Janela original informada:** aproximadamente 13h20–13h26 (Brasília)
**Escopo:** leitura de código, logs e metadados de produção. Nenhuma escrita, migration ou deploy foi executado.

## Resumo

O timeout do PostgreSQL está confirmado. Durante uma atualização do painel, consultas de parcelas, vínculos de acordos, pagamentos que efetivam acordos e acordos foram canceladas por `statement timeout` (SQLSTATE `57014`). A action server-side propaga falha de qualquer página de qualquer uma das oito leituras paginadas paralelas; por isso uma consulta que falha impede a montagem do conjunto de indicadores.

Não foi possível atribuir a falha a uma única consulta ou a um `OFFSET` específico: os registros disponíveis não contêm os parâmetros dos limites de paginação, e não foi obtido um plano `EXPLAIN` representativo. As estatísticas agregadas apontam múltiplas consultas próximas do limite, não uma causa isolada.

## Código publicado e recorrência

- O alias de produção `https://gkli-cob.vercel.app` apontava, durante a verificação, para deployment READY `dpl_8Wcod3E3CcFTv5j8YJjSDbUw2AKW`, commit `860c9f4410ff117272dcb089c3de8aaede7264a8` (PR #59).
- O deployment #58 (`dpl_A3BYrPsxriSpxKBuwzdhUEHox65Y`, commit `686fc269a66b4a45a2bb697ec83f135cb82c2477`) também estava publicado. A versão #57 corresponde ao commit `ff828820130f791892eb49f7122b42bc545b60e2`.
- O blob de `features/dashboard/tv-actions.ts` nos commits #58 e #59 é o mesmo (`2edbb133799bae0600679659ae481bb8b6baa9e6`): essa action não foi alterada nesses deployments.
- A Vercel continuava agrupando chamadas de TV com erros no deployment #57 até aproximadamente 14h57 BRT. Isso é compatível com TVs/sessões abertas que mantiveram referência a Server Actions antigas; não prova que uma sessão nova no alias #59 também falhe.
- Não houve logs correspondentes da rota TV para o alias #59 na janela consultada. Ausência de amostra não demonstra recuperação.

## Evidências do timeout e das consultas

Na janela original (13h20–13h26 BRT; 16h20–16h26 UTC), os logs do Postgres registraram `canceling statement due to statement timeout`. Na Vercel, os mesmos períodos tiveram falhas com as mensagens:

- `Não foi possível consultar as parcelas.`
- `Não foi possível consultar os vínculos dos acordos.`
- `Não foi possível consultar os pagamentos que efetivam os acordos.`

Uma segunda leitura dos logs do Postgres, entre 14h50 e 14h56 BRT (17h50–17h56 UTC), encontrou novos timeouts em cada minuto para quatro formatos de consulta: parcelas com filtro por vencimento ou pagamento, parcelas pagas com junção de acordo, vínculos de acordo com junção de acordo e acordos com filtro combinado de data/status. Portanto, o problema continuava ocorrendo no banco durante a investigação.

Estatísticas de `pg_stat_statements` disponíveis (acumuladas desde 15/10/2026, não restritas ao incidente):

| Consulta | Chamadas | Média | Máximo | Shared block hits |
|---|---:|---:|---:|---:|
| `acordo_cobrancas` com junção de `acordos` | 75 | 5.419 ms | 7.939 ms | 1.078.661 |
| parcelas pagas com junção de `acordos` | 66 | 5.374 ms | 7.638 ms | 1.553.027 |
| `acordos` com filtro amplo de tipo/data/status | 202 | 4.216 ms | 7.650 ms | 3.740.850 |

Os hits são acumulados e não equivalem a linhas retornadas. As consultas identificadas tiveram quase nenhuma leitura física de blocos; isso é compatível com custo de CPU, avaliações repetidas, junções ou RLS, mas não prova qual componente domina. A consulta de parcelas por vencimento/pagamento apareceu nos logs recentes, mas não havia estatística correspondente disponível na leitura consultada.

## Caminho no código e mecanismo de falha

Em [tv-actions.ts](../features/dashboard/tv-actions.ts), `pages<T>` busca páginas de 1.000 registros sequencialmente por consulta e acumula todos os resultados. A action executa oito fluxos paginados em `Promise.all`. Quando uma página retorna erro, a helper lança erro genérico; o `Promise.all` rejeita o conjunto e a TV não recebe os indicadores daquele refresh. Os outros fluxos paralelos não são cancelados automaticamente.

As leituras mais amplas identificadas incluem:

- parcelas com junção a acordos e filtro por `vencimento` **ou** `data_pagamento`, mais os filtros de tipo, origem e carteira;
- todos os vínculos elegíveis de `acordo_cobrancas`, sem restringir às cobranças candidatas já carregadas;
- todas as referências de parcelas pagas para acordos da carteira, sem limitar aos acordos candidatos já carregados;
- acordos selecionados por um `OR` de intervalo de data, data atual ou status elegível.

O painel padrão chama a coleta sem uma seleção opcional mais restrita. Assim, a carga abrange as carteiras permitidas do usuário. Os filtros explícitos de carteira e a RLS continuam presentes e devem ser preservados.

Em [page.tsx](../app/app/dashboard/tv/page.tsx), a atualização seguinte é agendada 30 segundos depois que a requisição anterior termina. Uma TV individual não sobrepõe seus próprios ciclos por esse timer recursivo, mas TVs diferentes podem coincidir. Não há jitter/backoff entre sessões. A duração próxima de 8 segundos observada nas estatísticas e o intervalo de ~30 segundos são compatíveis com a recorrência dos logs, embora não demonstrem concorrência como causa do timeout.

As mensagens de erro técnicas são resumidas pela action. A interface pode mostrar `Failed to fetch` quando a conexão/action falha; o React #441 informa erro genérico de renderização de Server Components em produção, com detalhes omitidos. É plausível que seja consequência da falha do fluxo, mas não há evidência suficiente para ligar cada ocorrência de #441 ao mesmo timeout. [Decodificador oficial do React #441](https://react.dev/errors/441).

## Banco, índices e RLS

Estimativas observadas de tabela/tamanho: `acordo_cobrancas` ~8.628 linhas / 2,8 MB; `acordos` ~5.218 / 9,0 MB; `parcelas_acordo` ~9.093 / 7,8 MB. São estimativas do catálogo, não contagens transacionais exatas.

Índices relevantes observados:

- `acordo_cobrancas`: índices em `acordo_id`, `cobranca_id`, único `(acordo_id, cobranca_id)` e PK;
- `parcelas_acordo`: índices `(acordo_id, status, vencimento)`, `(acordo_id, status, vencimento, numero)`, `(status, vencimento)`, `(acordo_id)`, único `(acordo_id, numero)` e PK. Não foi observado índice que comece por `data_pagamento`;
- `acordos`: PK e vários índices por carteira, status, data, unidade e condomínio.

Isso não basta para recomendar índice: falta plano real com filtros e parâmetros representativos. Em especial, o predicado `vencimento ... OR data_pagamento ...` pode dificultar o uso eficiente dos índices existentes, mas isso permanece hipótese até `EXPLAIN` comprovar o caminho e o custo.

A RLS está habilitada nas três tabelas. As policies de `acordos` usam `current_user_can_access_carteira(carteira_id)`; as de `acordo_cobrancas` e `parcelas_acordo` verificam o acesso pela carteira do acordo relacionado. A função consulta o papel/perfil e `usuarios_carteiras`. Os contextos dos erros incluem essas funções de autorização. Portanto, a verificação de carteira faz parte do caminho observado, mas o custo atribuível à policy ainda não foi medido isoladamente. Não remover RLS, autorização ou filtros de carteira.

## Causa raiz

**Confirmada:** o banco cancela consultas do painel por `statement timeout`; a coleta trata falha de página como falha integral do refresh. Uma falha deixa os indicadores indisponíveis em vez de produzir um resultado completo.

**Mecanismo contribuinte fortemente indicado:** oito streams paginados paralelos, com leituras abrangentes e algumas de histórico, alto volume agregado e repetição automática independente por TV. As estatísticas colocam ao menos três formatos de consulta perto do limite de timeout.

**Ainda não isolada:** qual consulta/página específica dispara primeiro, quanto do custo vem dos predicados/junções versus RLS, e se a concorrência das TVs é necessária para reproduzir o timeout. As métricas agregadas não identificam causa única.

## Correção aplicada localmente e próximos passos

Foi aplicado no checkout local, ainda sem publicação:

1. A coleta registra por página lenta (>=1.000 ms) ou falha um rótulo estático da consulta, número da página/offset, limite, duração, quantidade de linhas (em página lenta), SQLSTATE/status quando disponível e correlation ID aleatório. Não registra filtros, IDs, payloads ou mensagens do banco.
2. Os vínculos de acordos agora são limitados aos IDs das cobranças candidatas daquela atualização, em blocos de 200, preservando status, seleção de carteira/condomínio e RLS.
3. As referências de parcelas pagas agora são limitadas aos acordos carregados ou presentes nas parcelas do período, também em blocos de 200 e preservando origem, status, seleção e RLS. O conjunto inclui acordos antigos presentes nas parcelas do período, pois pagamentos anteriores podem efetivar o acordo.
4. O join de parcelas retorna somente os campos de acordo consumidos pelos cálculos e slides, reduzindo o payload.
5. A TV usa espera progressiva de 30 s até 5 min com jitter depois de erros e pausa atualizações em abas ocultas; ao voltar à aba, tenta atualizar imediatamente. Falha continua sendo erro, nunca indicador zero, e os dados anteriores permanecem visíveis quando já existirem.

Após publicar em ambiente adequado, ainda é necessário:

1. Confirmar nos logs qual consulta/página era lenta e comparar suas durações após a mudança.
2. Medir planos sob papel e escopo equivalentes com dados representativos; só então alterar o `OR` de datas ou propor índices/migrations.
3. Comparar totais financeiros por carteira e período entre a versão anterior e a corrigida, incluindo acordos antigos com parcela paga e vínculos de composição.
4. Observar várias TVs/ciclos e confirmar sucesso inicial, indicação de dado desatualizado durante falha e recuperação automática no ciclo seguinte.

Não aumentar `statement_timeout` como correção.

## Validação realizada e pendente

**Realizada:** leitura do código e do histórico de deployments; correlação temporal de logs Vercel/Postgres; consulta somente leitura a `pg_stat_statements`, catálogo de tabelas/índices e policies; após a alteração local, `npx tsx --test scripts/validate-tv-dashboard.ts` aprovou 18 testes e `npm run typecheck` passou. Os testes cobrem cálculos e a seleção dos IDs de acordos relevantes, não a consulta real nem a recuperação da TV após erro.

**Não realizada:** reprodução local com Postgres/Supabase (não há Docker nem Podman disponíveis neste checkout); plano `EXPLAIN` representativo; identificação histórica do offset/página que expirou; contagem exata de bytes transferidos; teste de carga simultânea entre TVs; comparação end-to-end de totais antes/depois; comprovação de recuperação automática da versão corrigida (ainda local). Os logs históricos não registram os parâmetros de paginação. A ausência de logs da rota no deployment #59 não confirma saúde.

Para fechar a validação da correção local, comparar em ambiente controlado os totais de cobranças, acordos, parcelas pagas/efetivadoras e slides por carteira e período, incluindo casos legados e financeiros relevantes; observar duração, linhas/bytes, erros e RLS; então manter TVs abertas por vários ciclos e confirmar que uma falha temporária mostra estado desatualizado/erro e que o próximo ciclo recupera os indicadores sem recarga manual. Esses testes dependem de ambiente com dados representativos e da publicação autorizada.
