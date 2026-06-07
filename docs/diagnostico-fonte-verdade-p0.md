# Diagnostico P0 - Fonte de Verdade

Data: 2026-06-05

Escopo: auditoria/timeline, status de cobranca/acordo e parcelas.

## 1. Resumo

O app ja tem uma direcao tecnica parcialmente implementada:

- `features/operacional/service.ts` centraliza a escrita operacional em `registrarEventoOperacional`;
- `lib/constants/cobrancas.ts` e `lib/constants/acordos.ts` definem status canonicos;
- `parcelas_acordo` aparece como fonte pratica de parcelas de acordo nos fluxos principais;
- `cobranca_parcelas` aparece como fonte de parcelas de cobranca na conversao/importacao.

Ainda ha risco de divergencia porque algumas leituras decidem localmente entre campos canonicos e legados, principalmente `status_operacional ?? status`.

## 2. Auditoria e timeline

### Escritas centrais

- `features/operacional/service.ts` escreve primeiro em `timeline_operacional`.
- Se falhar, tenta `eventos_operacionais`.
- Se falhar, tenta `auditoria_eventos`.

### Escritas diretas fora do helper

- `features/importacoes/actions.ts` escreve diretamente em `auditoria_eventos`.
- `features/condominios/actions.ts` escreve diretamente em `auditoria_eventos`.

### Leituras diretas

- `features/timeline/queries.ts` le `timeline_operacional`.
- `features/cobrancas/queries.ts` le `eventos_operacionais` e `auditoria_eventos`.
- `features/acordos/queries.ts` le `eventos_operacionais` e `auditoria_eventos`.
- `features/operacional/queries.ts`, `features/analytics/queries.ts`, `features/cockpit/queries.ts` e `features/unidades/queries.ts` leem `eventos_operacionais`.

### Resultado implementado

- `registrarEventoOperacional` agora aceita `auditavel`, `origem`, `antes` e `depois`.
- Eventos narrativos continuam entrando em `timeline_operacional`.
- Eventos marcados como `auditavel` tambem tentam gravar `auditoria_eventos`.
- Para compatibilidade com schema incerto, o antes/depois estruturado fica dentro do JSON `depois` de `auditoria_eventos`.
- O fallback antigo para `eventos_operacionais` e `auditoria_eventos` foi preservado.
- `transicionarEstadoOperacional` agora busca o estado anterior de cobranca/acordo antes de atualizar e registra anterior/novo.

### Risco residual

P1: ainda falta confirmar o schema live de `auditoria_eventos` e decidir se vale promover `antes` para coluna propria. Enquanto isso, a implementacao evita depender dessa coluna.

## 3. Status de cobranca

### Direcao canonica

- `cobrancas.status_operacional`: fluxo de trabalho.
- `cobrancas.status_financeiro`: situacao financeira.
- `cobrancas.status`: legado/compatibilidade.

### Pontos com fallback local

- `app/app/cobrancas/page.tsx`
- `app/app/cobrancas/[id]/page.tsx`
- `features/cobrancas/queries.ts`
- `features/acordos/actions.ts`
- `features/acordos/queries.ts`
- `app/app/acordos/selecionar/page.tsx`
- `app/app/gestao/saneamento-cobrancas/page.tsx`
- `features/operacional/queries.ts`
- `features/unidades/queries.ts`
- `features/relatorios/queries.ts`
- `features/dashboard/queries.ts`
- `features/cockpit/rules.ts`
- `app/app/workspace/[id]/page.tsx`

### Risco

P0: telas e regras podem divergir se `status` e `status_operacional` tiverem valores diferentes. O fallback deve existir apenas em helper canonico, com preferencia clara por `status_operacional`.

### Ajuste live identificado em 2026-06-06

Ao criar acordo, o banco recusou `cobrancas.status = 'acordo_firmado'` pela constraint `cobrancas_status_check`. A causa e que algumas bases ainda aceitam valores legados com espaco em `cobrancas.status`, enquanto `status_operacional` usa snake_case.

Foi criada a migration `supabase/sql/2026-06-06_criar_acordo_financeiro_status_compat.sql` para separar os campos dentro da RPC:

- `cobrancas.status_operacional`: recebe o valor canonico, como `acordo_firmado`;
- `cobrancas.status`: recebe o formato aceito pela constraint legada, como `acordo firmado`, quando necessario.

Tambem foi criada a migration `supabase/sql/2026-06-06_cobrancas_status_check_compat.sql` para ampliar a constraint legada e aceitar ambos os formatos em `cobrancas.status`. Essa segunda protecao evita quebra caso alguma rotina antiga ainda grave o valor canonico diretamente no campo legado.

Outro erro live apareceu na etapa seguinte da criacao do acordo: insert bloqueado por RLS em `acordos_termos`. Foi criada a migration `supabase/sql/2026-06-06_rls_acordos_termos_aceites.sql` para liberar:

- operador autenticado gerenciar `acordos_termos` e `acordos_aceites`;
- pagina publica de aceite ler/atualizar termo;
- pagina publica registrar aceite.

Na revisao geral do fluxo de criacao de acordo, apareceu a proxima trava:
`mensagens_contexto_check_v1` rejeitava o e-mail interno do acordo. O codigo
usa `mensagens.contexto = 'acordo'` ao criar termo/e-mail de acordo e tambem
nas reguas de acordo; a regua de cobranca usa `cobranca`.

Foi criada a migration `supabase/sql/2026-06-06_revisao_fluxo_criar_acordo_mensagens.sql`
para alinhar a constraint de `mensagens.contexto` aos contextos usados pelo app
e criar uma policy `mensagens_authenticated_all` quando a tabela existir.

## 4. Status de acordo

### Direcao canonica

- `acordos.status`: vida operacional/contratual.
- `acordos.status_financeiro`: situacao financeira consolidada.
- `acordos.fluxo_status`: formalizacao, aceite, boletos e rompimento assistido.

### Risco

P1: ha usos corretos dos tres campos, mas ainda falta documentar a diferenca final entre `acordo_firmado` e `acordo_efetivado` na cobranca e entre `status` e `fluxo_status` no acordo.

## 5. Parcelas

### Fonte canonica de parcelas de acordo

Foi encontrado uso operacional de `parcelas_acordo` em:

- `features/acordos/actions.ts`
- `features/acordos/queries.ts`
- `features/acordos/status-service.ts`
- `features/cobrancas/queries.ts`
- `features/regua/services/processar-regua-acordos.ts`
- `features/regua/queries.ts`
- `features/importacoes/actions.ts`
- `features/dashboard/queries.ts`
- `features/cockpit/queries.ts`
- `app/api/condominios/[id]/exportacoes/[tipo]/route.ts`

Nao foram encontrados usos de `acordos_parcelas` em `app`, `features`, `lib` ou `utils` nesta busca.

O banco live confirmou que a tabela legada `acordos_parcelas` existe. Portanto ela deve ser tratada como legado presente, sem uso operacional identificado no codigo atual.

O comparativo live retornou:

- `parcelas_acordo`: 0 registros e 0 acordos com parcelas;
- `acordos_parcelas`: 0 registros e 0 acordos com parcelas.

Conclusao: nao ha migracao de dados a fazer entre legado e canonico neste momento.

### Fonte canonica de parcelas de cobranca

- `app/api/conversao-relatorio/confirmar/route.ts` grava `cobranca_parcelas`.

### Risco

P0: baixo no codigo atual para `acordos_parcelas`, porque a busca nao encontrou dependencia operacional ativa. Ainda falta comparar dados live entre legado e canonico antes de qualquer decisao de bloqueio/remocao.

Foi criado o comparativo somente leitura `supabase/sql/2026-06-05_comparar_parcelas_acordo_legado.sql` para medir:

- schema lado a lado;
- volume total por tabela;
- status existentes;
- acordos presentes somente no legado;
- acordos presentes somente no canonico;
- acordos presentes nas duas fontes com divergencia de contagem ou valor.

Como ambas as tabelas estavam vazias no live, foi criada a migration `supabase/sql/2026-06-05_bloquear_acordos_parcelas_legado.sql` para impedir escrita futura acidental em `acordos_parcelas`.

## 6. Ordem de execucao recomendada

1. Criar helper canonico para leitura de status de cobranca.
2. Aplicar o helper em `features/cobrancas/queries.ts`, `app/app/cobrancas/page.tsx` e `app/app/cobrancas/[id]/page.tsx`.
3. Migrar os proximos consumidores por dominio: acordos, saneamento, unidade, relatorios, dashboards e workspace.
4. Ajustar `registrarEventoOperacional` para gravar auditoria estruturada de forma explicita nos eventos sensiveis. Concluido parcialmente para cobrancas, acordos e parcelas.
5. Agrupar helpers/eventos especificos de mensagens na frente `Mensageria 2.0`.
6. Criar diagnostico SQL live para valores fora dos enums canonicos. Criado em `supabase/sql/2026-06-05_diagnostico_fonte_verdade.sql`.
