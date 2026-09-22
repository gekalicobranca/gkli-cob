# Arquivamento reversível — ensaio e piloto

O SQL `ensaio-arquivamento.sql` e os fixtures TypeScript são um **protótipo isolado**, sem leitura de credenciais ou envio de mensagens. Esse SQL só instala quando o banco de teste está identificado com `gkli.ambiente_ensaio=isolado`. As migrações reais ficam em `supabase/migrations/2026092302*.sql` e não são cópias desse protótipo.

`piloto-transacional.mjs` implementa o executor administrativo limitado aos cinco pares revisados do Rio Negro (R$ 4.793,75). Recebe uma conexão PostgreSQL autenticada; não abre conexão nem lê credenciais por conta própria. Não é RPC do aplicativo. `operarPiloto(db, manifesto, { hash, modo })` aceita `simular` (padrão, somente leitura), `aplicar` e `reverter`, com hash exato, prazo do manifesto, inventário e imagens de dados. A preparação operacional precisa conferir backup e publicação antes de chamar `aplicar`.

O executor usa uma janela transacional: lock compartilhado com reservas de e-mail, locks ordenados nas tabelas públicas inventariadas e locks das dez cobranças. Leituras permanecem disponíveis; escritas concorrentes aguardam. Se não obtiver os locks em quatro segundos, aborta sem alterações. O módulo não muda jobs nem reativa mensagens e recusa agenda, tentativa incerta ou mensagem não terminal do piloto. Na execução operacional, o invocador registra e pausa temporariamente os dois jobs, confere ausência de envios em trânsito e restaura exatamente o estado anterior após conferir commit/rollback. Os locks são amplos e essa estratégia não deve ser ampliada para um lote grande.

A escolha atual preserva as cinco cobranças antigas, às quais pertencem as parcelas. Completa a competência a partir da importação conferida, arquiva as cinco cópias novas e resolve cinco alertas falsos de ausência, com motivo e fonte no payload. Não altera principal, encargos ou situação de negócio. Auditoria, mensagens e parcelas permanecem; a repetição usa o mesmo lote/hash. A reversão exige imagem posterior intacta, restaura campos alterados e conserva a auditoria. `updated_at` avança normalmente; o timestamp anterior fica na imagem histórica.

O protótipo isolado abaixo aceita pares com mesma carteira, condomínio, unidade, recibo, vencimento e valores, sem vínculo financeiro ou situação especial. O executor real descrito acima também preserva as cinco parcelas inventariadas; essa decisão foi conciliada individualmente. A cópia recebe `duplicada_de_id`, lote e timestamp; seu valor e status de negócio permanecem intactos. A projeção de teste `cobrancas_canonicas` exclui a cópia das somas. Mensagens, itens, comprovantes e alertas nunca são apagados ou redirecionados por esse protótipo.

Cada aplicação exige o SHA-256 da imagem anterior, mantém antes/depois e usa uma chave de lote/grupo. A transação recusa alterações de dados, pendência aberta, agenda, tentativa incerta, mensagem ligada a outro débito ou FK desconhecida. Repetição da mesma operação não duplica eventos. A reversão só ocorre se a imagem posterior ainda coincide; não altera nem reativa mensagens. Falha na gravação da auditoria desfaz o arquivamento inteiro.

## Executar os testes

```powershell
node node_modules/tsx/dist/cli.mjs --test scripts/validate-arquivamento-duplicidades.ts
node node_modules/tsx/dist/cli.mjs scripts/limpeza-duplicidades/ensaiar-piloto.ts .codex-tmp/judicial-review/piloto-detalhado.json outputs/auditoria-cobrancas-2026-09-22/ensaio-piloto.json
```

O segundo comando importa um snapshot local em PGlite descartável. Primeiro verifica a recusa dos cinco casos reais com pendências abertas. Depois simula, **somente nessa cópia**, que a revisão resolveu os alertas; arquiva cinco cópias, verifica somas/histórico/idempotência e reverte. Nenhum estado do snapshot de entrada é sobrescrito. A hipótese não constitui resolução das pendências reais.

## Limites antes da implementação em produção

- O fixture preserva os dados completos consultados em `evidencia`, mas tem um schema reduzido. Não reproduz todas as RLS, funções, triggers e dependências do banco real.
- A captura de dependências é integral nas tabelas conhecidas do fixture. Não é um inventário do catálogo real nem uma descoberta exaustiva de referências em JSON, documentos, pagamentos indiretos e tabelas polimórficas.
- Os locks amplos são adequados ao ensaio, não estão aprovados para o banco de produção. PGlite não valida duas conexões PostgreSQL concorrentes nem workers externos.
- A projeção canônica existe só no ensaio. É necessário integrar o arquivamento às listagens, card, subtotais, relatórios, exportações, acordos, importações, flows, cron e workers. O banco também deverá impedir novas operações sobre uma cópia arquivada e alterações diretas nos campos de arquivo.
- Limite histórico do protótipo: ele não ativa a trava de recibos. A migração real já foi instalada em 22/09/2026 após ensaio de concorrência PostgreSQL; ver o procedimento atualizado.
- O piloto depende de backup validado, revisão das cinco pendências, inventário completo, ensaio em cópia real com envios desativados e janela sem trabalho em trânsito.

Portanto, **não mover este SQL para `supabase/migrations` nem expor as funções como RPC de aplicação** antes de concluir esses itens. A identificação do ambiente de ensaio é uma proteção contra instalação acidental, não um mecanismo de autenticação para produção.
