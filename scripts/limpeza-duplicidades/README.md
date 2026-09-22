# Arquivamento reversível — ensaio isolado

Este diretório contém um **protótipo de ensaio**, não uma migração nem um executor de produção. Não há cliente Supabase, leitura de credenciais ou envio de mensagens nos scripts TypeScript daqui. O SQL só instala quando o banco de teste está identificado com `gkli.ambiente_ensaio=isolado`.

O piloto aceita pares com mesma carteira, condomínio, unidade, recibo, vencimento e valores, sem vínculo financeiro ou situação especial. A cópia recebe `duplicada_de_id`, lote e timestamp; seu valor e status de negócio permanecem intactos. A projeção de teste `cobrancas_canonicas` exclui a cópia das somas. Mensagens, itens, comprovantes e alertas nunca são apagados ou redirecionados por esse protótipo.

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
- A migração de proteção de recibos ainda precisa ser ativada com acesso administrativo autorizado. A Management API retornou 403 na verificação anterior.
- O piloto depende de backup validado, revisão das cinco pendências, inventário completo, ensaio em cópia real com envios desativados e janela sem trabalho em trânsito.

Portanto, **não mover este SQL para `supabase/migrations` nem expor as funções como RPC de aplicação** antes de concluir esses itens. A identificação do ambiente de ensaio é uma proteção contra instalação acidental, não um mecanismo de autenticação para produção.
