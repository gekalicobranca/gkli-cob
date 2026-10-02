# Proteção dos jobs de flows

Correção local dos endpoints `/api/jobs/flows/montar` e
`/api/jobs/flows/progredir` após o incidente de chamadas HTTP lentas e falhas
de conectividade. Não comprova a causa do incidente nem representa aplicação
em produção.

## Comportamento

- Uma reserva persistente compartilhada impede trabalho pesado simultâneo
  entre as duas rotas e entre instâncias diferentes da Vercel. O token impede
  uma execução antiga de liberar a reserva de outra. A reserva dura quatro
  minutos e uma interrupção deixa uma pausa persistida após sua expiração.
- Falhas retornadas pelos serviços, exceções, SSL, timeout, respostas HTTP fora
  de 2xx e ausência de resposta do `pg_net` geram pausa de 2, 4, 8, 16 e até 30
  minutos. Uma conclusão bem-sucedida zera as falhas do endpoint.
- O tick reserva a chamada HTTP antes de enviar outra. Não despacha quando há
  trabalho em andamento ou backoff. As filas alternam quando ambas têm trabalho.
- Progressão faz uma descoberta e processa no máximo um job por chamada. O
  claim não reconstrói mais o histórico. A descoberta avalia até 25 mensagens
  alteradas e uma página de 25 mensagens antigas, com cursor persistido.
- Alterações de mensagens enviadas, flows e réguas marcam fontes para
  reavaliação. Uma nova passagem paginada começa 15 minutos após concluir a
  anterior, cobrindo mudanças de elegibilidade fora desses eventos. Filas
  antigas grandes levam várias chamadas para terminar essa passagem.
- O histórico consultado para deduplicação e primeiro envio é restrito à
  régua e às cobranças das fontes da página; vínculos e IDs consolidados no
  payload continuam sendo considerados. Esse histórico pode ser grande para
  cobranças com muitas mensagens; o limite de páginas não garante custo
  constante dessa consulta. Conferir planos e tempos no ambiente real.
- Sem fontes, passagem histórica devida ou jobs vencidos, o tick de progressão
  não chama a Vercel. O tick de montagem respeita também a pausa global do Maestro.
- Dentro do trabalho das rotas, os clientes administrativos compartilham um
  orçamento de 90 segundos e 400 requisições ao Supabase, com 15 segundos por
  requisição. A rota tem teto de 120 segundos e reserva tempo para registrar
  a conclusão ou falha. Isso não substitui o timeout SQL no servidor.
- Montagem automática com mais de 2.000 cobranças na importação vai para
  atenção, sem planejar o conjunto inteiro. Progressão com mais de 40 cobranças
  também exige revisão. As regras por unidade e limites de mensagens permanecem.

## Publicação

1. Aplicar somente a migração
   `20261002021211_flows_jobs_protecao_carga.sql`, após conferir o estado e
   histórico do ambiente alvo. Não publicar outras migrações pendentes junto.
   A migração desativa os cron pelos nomes `gkli-maestro-flows` e
   `gkli-flow-progressao`; não depender dos números 2 e 3 entre ambientes.
2. Publicar as rotas e os serviços atualizados. Sem as novas RPCs as rotas
   recusam processamento, em vez de executar sem proteção.
3. Conferir a recarga do cache PostgREST e os timeouts de função de 10 segundos
   para descoberta e claims. O limite por função depende do PostgREST aplicar
   essa configuração à transação da RPC. Referências:
   [timeouts no Supabase](https://supabase.com/docs/guides/database/postgres/timeouts)
   e [configurações de função no PostgREST](https://docs.postgrest.org/en/stable/references/transactions.html).
4. Validar em ambiente de teste com montagem, progressão D+7/D+15, fila vazia,
   duas chamadas simultâneas, retomada e falha de rede. Em produção, consultar
   filas e planos antes de executar endpoints: eles criam e ativam flows.
5. Reativar os cron somente depois da validação e de autorização para retomada.
   Nenhuma alteração local ou migração desta correção os reativa.

Consultar `flows_jobs_controle` para lease, próximo horário permitido, falhas
e ID HTTP pendente; `flow_progressao_backfill` para o cursor histórico; e
`flow_progressao_fontes` para a quantidade de eventos ainda não avaliados.
Não limpar tokens ou zerar backoff enquanto uma execução estiver ativa.

## Validação local

```powershell
node_modules/.bin/tsx.cmd --test scripts/validate-flow-jobs.ts scripts/validate-flow-progressao.ts scripts/validate-maestro-flows.ts scripts/validate-maestro-ativacao.ts
npm run typecheck
```

Os testes SQL usam PGlite com mocks de `pg_net`, Vault e cron. Exercitam o SQL
da migração, permissões, leases, backoff, cursor e regras de negócio, mas não
validam DNS, SSL, timeout efetivo do PostgREST ou performance em produção.
