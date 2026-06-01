# Mapa de divergencias schema x codigo

Data do mapeamento: 2026-06-01.

Fonte oficial de migracoes considerada: `supabase/sql`.

Fonte de schema real considerada: OpenAPI do PostgREST do Supabase live, consultado em modo leitura. O schema live exposto retornou 88 entidades.

Este documento e somente diagnostico. Nenhuma correcao foi aplicada.

## 1. Resumo executivo

Ha tres grupos prioritarios de divergencia:

1. O fluxo formal de acordo/aceite esta no codigo, mas partes do schema esperado nao existem no banco live.
2. A rota `app/api/conversao-relatorio/confirmar/route.ts` ainda grava campos legados/inexistentes em `unidades` e `cobrancas`.
3. Existem migracoes oficiais em `supabase/sql` que ainda nao aparecem aplicadas no banco live.

O maior risco imediato e operacional: criar acordo, aceitar termo publico ou confirmar conversao pode falhar em tempo de execucao por tabela/coluna inexistente.

## 2. Divergencias P0 confirmadas contra o banco live

### 2.1 Tabelas de aceite de acordo ausentes no banco live

O codigo usa `acordos_termos` em:

- `app/aceite-acordo/[token]/page.tsx`
- `app/aceite-sindico/[token]/page.tsx`
- `features/acordos/actions.ts`

Pontos concretos:

- `features/acordos/actions.ts:109` cria termo em `acordos_termos`.
- `features/acordos/actions.ts:249` consulta aceites em `acordos_termos`.
- `features/acordos/actions.ts:1309` localiza termo por token.
- `features/acordos/actions.ts:1324` marca termo como aceito.

Problema:

- `acordos_termos` nao aparece no schema live.
- `acordos_aceites` tambem nao aparece no schema live, mas o codigo insere nela em `features/acordos/actions.ts:1337`.

Impacto:

- links publicos de aceite do devedor/sindico tendem a falhar;
- criacao de acordo que tenta gerar termo tende a falhar;
- fluxo de boletos pos-aceite fica bloqueado.

Observacao:

- essas tabelas existiam na pasta `database/`, que foi descartada como fonte oficial;
- elas nao aparecem atualmente em `supabase/sql`.

### 2.2 Colunas de fluxo formal ausentes em `acordos`

O codigo usa colunas que nao existem no banco live:

- `fluxo_status`
- `exige_aprovacao_sindico`
- `sindico_aprovado_em`
- `devedor_aceito_em`
- `boletos_solicitados_em`

Pontos concretos:

- `features/acordos/actions.ts:309` atualiza `boletos_solicitados_em` e `fluxo_status`.
- `features/acordos/actions.ts:528` insere `fluxo_status` e `exige_aprovacao_sindico`.
- `features/acordos/actions.ts:1351` atualiza `sindico_aprovado_em` e `fluxo_status`.
- `features/acordos/actions.ts:1380` atualiza `devedor_aceito_em` e `fluxo_status`.

Impacto:

- criacao de acordo formal pode quebrar no insert;
- aceite publico pode quebrar no update;
- status visual do fluxo de aceite/boletos fica sem persistencia.

Observacao:

- `supabase/sql/2026-05-27_adm1_central_operacional_administradoras.sql` adiciona `boletos_emitidos_em`, mas nao adiciona as colunas acima.

### 2.3 Tabela `acordo_cobrancas` prevista em migracao, mas ausente no banco live

O codigo usa `acordo_cobrancas` em:

- `features/acordos/actions.ts:571`
- `features/acordos/queries.ts:133`

A migracao oficial existe:

- `supabase/sql/2026-05-27_acordo_cobrancas_agrupamento.sql`

Problema:

- `acordo_cobrancas` nao aparece no schema live.

Impacto:

- acordo com multiplas cobrancas falha ao vincular cobrancas;
- consultas de detalhe do acordo podem falhar ou voltar incompletas;
- rastreabilidade entre acordo e debitos originais fica comprometida.

### 2.4 Conversao de relatorio grava campos inexistentes

Arquivo:

- `app/api/conversao-relatorio/confirmar/route.ts`

Em `unidades`, o codigo insere:

- `unidade`
- `ativo`

Ponto:

- `app/api/conversao-relatorio/confirmar/route.ts:83`

No schema live, `unidades` usa `identificacao` e `status`; nao ha `unidade` nem `ativo`.

Em `cobrancas`, o codigo insere:

- `responsavel_nome`
- `valor_total`

Ponto:

- `app/api/conversao-relatorio/confirmar/route.ts:124`

No schema live, esses campos nao existem em `cobrancas`.

Impacto:

- confirmar conversao tende a falhar quando precisar criar unidade ou cobranca;
- PDFs da proxima implementacao provavelmente vao bater nesse ponto se usarem esse endpoint.

### 2.5 Atualizacao de mensagem usa coluna inexistente

Arquivo:

- `features/mensageria/actions.ts`

Ponto:

- `features/mensageria/actions.ts:721`

O update de `mensagens` envia:

- `updated_at`
- `atualizado_em`

No schema live, `mensagens` tem `updated_at`, mas nao tem `atualizado_em`.

Impacto:

- editar mensagem manual pode falhar por coluna inexistente;
- como o payload vai em um unico update, a presenca de `atualizado_em` pode impedir a atualizacao inteira.

## 3. Migracoes oficiais nao refletidas no banco live

Estas diferencas foram encontradas comparando `supabase/sql` com o schema live.

### 3.1 Tabelas previstas mas ausentes

- `acordo_cobrancas`
  - arquivo: `supabase/sql/2026-05-27_acordo_cobrancas_agrupamento.sql`

- `lote_administradora_itens`
  - arquivo: `supabase/sql/2026-05-27_adm1_central_operacional_administradoras.sql`

### 3.2 Colunas previstas mas ausentes

Em `logs_operacionais_adm`:

- `origem_retorno`
- `payload`

Em `condominios`:

- `planilha_debitos_competencia`
- `planilha_debitos_atualizada_em`
- `parcelas_permitidas_sem_aprovacao_sindico`
- `dias_reemissao_parcela_acordo_atraso`

Em `cobrancas`:

- `planilha_debitos_competencia`
- `planilha_debitos_atualizada_em`
- `planilha_debitos_solicitacao_id`
- `bloqueio_formalizacao_motivo`

Em `acordos`:

- `boletos_emitidos_em`

Observacao:

- algumas colunas antigas de `condominios` parecem ter sido substituidas por nomes canonicos posteriores:
  - `parcelas_permitidas_sem_aprovacao_sindico` -> `parcelas_acordo_sem_aprovacao_sindico`
  - `dias_reemissao_parcela_acordo_atraso` -> `dias_reemissao_parcela_acordo_atrasada`
- por isso, essas duas precisam de avaliacao antes de aplicar qualquer migracao antiga.

## 4. Pontos que parecem coerentes no banco live

O banco live ja contem as entidades centrais:

- `carteiras`
- `profiles`
- `usuarios_carteiras`
- `administradoras`
- `administradora_contatos`
- `condominios`
- `unidades`
- `cobrancas`
- `cobranca_parcelas`
- `acordos`
- `parcelas_acordo`
- `acordos_parcelas` (legado/compatibilidade; nao usar como fonte operacional)
- `mensagens`
- `mensagens_templates`
- `lotes`
- `lote_itens`
- `timeline_operacional`
- `auditoria_eventos`
- `central_pendencias`
- `solicitacoes_administradora`
- `reguas`
- `regua_etapas`
- `regua_jobs`

Tambem foi confirmado antes, via leitura administrativa:

- `carteiras`: 4 registros
- `condominios`: 18 registros
- `unidades`: 439 registros
- `cobrancas`: 1 registro
- `acordos`: 1 registro
- `mensagens`: 0 registros
- `profiles`: 5 registros

## 5. Interpretacao tecnica

### 5.1 O fluxo de acordo esta a frente do banco

O codigo implementa uma camada formal de aceite:

- termo publico;
- aceite de sindico;
- aceite de devedor;
- carimbo de IP/user-agent;
- solicitacao de boletos apos aceite.

Mas o banco live nao tem as tabelas e colunas que sustentam esse fluxo.

Provavel causa:

- a migracao de aceite formal estava na pasta `database/`, que deixou de ser fonte oficial;
- ela precisa ser recriada/adaptada em `supabase/sql` antes de usar o fluxo.

### 5.2 O endpoint de confirmar conversao esta usando campos legados

O parser/conversor pode ate extrair dados corretamente, mas a confirmacao ainda tenta persistir em nomes que nao fazem parte do modelo live.

Correcoes provaveis:

- em `unidades`, remover `unidade` e trocar `ativo: true` por `status: "ativa"`;
- em `cobrancas`, remover `responsavel_nome` e `valor_total`;
- se `responsavel_nome` for necessario para relatorio, persistir na unidade, nao na cobranca;
- se `valor_total` for necessario, usar `valor_atualizado` ou `origem_linha_json` nas parcelas.

### 5.3 As migracoes ADM parecem parcialmente aplicadas

O banco live tem tabelas ADM importantes, mas faltam algumas colunas previstas no SQL oficial.

Risco:

- bloqueio de formalizacao por planilha atualizada pode nao funcionar corretamente;
- lotes ADM podem falhar se dependerem de `lote_administradora_itens`;
- logs ADM podem perder origem/payload.

## 6. Ordem recomendada de correcao

1. Restaurar/adaptar a migracao do fluxo formal de acordo para `supabase/sql`.
   - Criar `acordos_termos`.
   - Criar `acordos_aceites`.
   - Adicionar em `acordos`: `fluxo_status`, `exige_aprovacao_sindico`, `sindico_aprovado_em`, `devedor_aceito_em`, `boletos_solicitados_em`.

2. Aplicar ou revisar a migracao `supabase/sql/2026-05-27_acordo_cobrancas_agrupamento.sql`.
   - Confirmar se ela roda limpa no banco atual.
   - Confirmar RLS/policies.

3. Corrigir `app/api/conversao-relatorio/confirmar/route.ts`.
   - Remover campos inexistentes.
   - Alinhar unidade/cobranca ao schema live.
   - Adicionar idempotencia/deduplicacao antes de importar PDFs reais.

4. Corrigir update de mensagem em `features/mensageria/actions.ts`.
   - Remover `atualizado_em` ou criar coluna oficialmente, escolhendo uma unica convencao.

5. Revisar migracoes ADM pendentes.
   - Separar nomes legados de nomes canonicos.
   - Aplicar somente o que ainda e necessario.

6. Depois disso, reexecutar o mapa schema x codigo.
   - O objetivo e zerar P0 antes de evoluir automacao/importacao.

## 7. Nao tratados neste mapa

Este mapeamento nao corrige:

- transacoes da criacao de acordo;
- `acordos_parcelas` ainda existe como legado/compatibilidade, mas `parcelas_acordo` fica definida como fonte de verdade operacional;
- politica final de auditoria/timeline;
- permissao por carteira em todas as actions;
- encoding corrompido em textos.

Esses seguem como proximos mapas/correcoes depois de alinhar schema e codigo.
