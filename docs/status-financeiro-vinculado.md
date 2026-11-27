# Status financeiro Vinculado

## Decisão de produto — 27/11/2026

O usuário solicitou retirar cotas judicializadas e suspensas de todos os totais gerais, mantendo os valores apenas nos detalhes e sem representar quitação. Escolheu o nome **Vinculado**, código canônico `vinculado`.

É uma classificação financeira administrativa da cota. Não cria acordo, vínculo de composição, processo ou prova de obrigação jurídica. O estado operacional continua `judicializado` ou `suspenso`. Não registrar pagamento, zerar saldo, excluir ou arquivar o débito por essa classificação.

## Regra de dados

A migration `20261127212757_cobrancas_financeiro_vinculado.sql` acrescenta o financeiro Vinculado e a coluna `status_financeiro_antes_vinculo`. Um trigger classifica cotas canônicas judicializadas/suspensas cujo financeiro seja em aberto, parcial ou vencido. O financeiro anterior fica preservado. Quitado e renegociado continuam distintos e não são convertidos.

O trigger roda após os classificadores operacionais e a proteção judicial. Quando a cota deixa esses estados operacionais, o financeiro pendente anterior é restaurado. Um refresh em aberto não apaga um parcial/vencido preservado. Um pagamento confirmado, ou uma renegociação, prevalece e limpa a referência anterior. Valores, datas de pagamento, vínculos, bloqueios e observações não são modificados pela regra.

Cada entrada/saída de Vinculado gera auditoria e timeline com antes/depois. O trigger não usa SECURITY DEFINER; respeita o escopo e as políticas existentes de auditoria por carteira. Não há nova tabela exposta ou alteração de RLS. O scanner passa a excluir Vinculado de sua classificação de cobranças abertas.

A migration não faz backfill. A mudança de registros já existentes é uma operação separada, após a publicação dos consumidores compatíveis, com transação, simulação com reversão, verificações de integridade e rastreio por operação.

## Totalizações e detalhes

`lib/core/cobranca-totalizacao.ts` centraliza a exclusão do financeiro Vinculado. As consultas de agregados filtram antes de limites, paginação e contagem. A lista/detalhe da cobrança preserva registros e valores. Os subtotais da listagem e das exportações excluem Vinculado; a exportação detalhada preserva os registros e o rótulo financeiro.

Consumidores abrangidos: resumo e agrupamentos de cobranças por carteira/condomínio, dashboards gerencial e operacional, produtividade, funil, analytics, métricas de condomínio/unidade, unidades críticas, IA, portal do síndico, operação síndico v2, catálogos, mobile, TV, pré-jurídico e elegibilidade de flows. A composição financeira do detalhe explica que Vinculado fica fora dos totais sem representar quitação.

Pagamentos efetivamente registrados, parcelas e acordos não são reinterpretados: indicadores de recebimento continuam baseados em suas fontes próprias. Totais históricos do arquivo importado e contadores de integridade cadastral continuam descrevendo a fonte ou os registros físicos, sem reescrever documentos anteriores.

## Validação e reversão

Testes funcionais usam Postgres PGlite para executar a migration: conversão de aberto/parcial, preservação de quitação e renegociação, registro de auditoria, manutenção de pagamentos/valores, retorno ao fluxo, refresh de origem, ordem em relação à proteção judicial e reconhecimento pelo scanner. Os testes de domínio verificam exclusão de agregados, catálogo e preservação dos dados em memória. Também são verificados os consumidores existentes de subtotais, pré-jurídico e TV.

Para desfazer a funcionalidade inteira, preparar uma migration de reversão que remova os dois triggers próprios, restaure o financeiro anterior apenas em registros ainda Vinculados e preservados desde a auditoria, e retire a constraint/coluna somente após confirmar ausência de dependentes. Não desabilitar proteções gerais nem restaurar cegamente o banco. A simples retomada operacional de uma cota utiliza o retorno automático ao financeiro anterior.

## Estado da entrega

Implementação em branch `codex/status-financeiro-vinculado`, worktree isolada para preservar as remoções e alterações locais do checkout principal. Publicação, aplicação da migration e backfill devem ser registrados aqui após a verificação em produção.

