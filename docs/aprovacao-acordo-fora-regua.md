# Aprovação de acordo com parcelas fora da régua

A importação de cobranças passa a iniciar com **Importar somente cobranças válidas na régua** desmarcado. A opção marcada continua preservando os recibos mais recentes somente no histórico do lote. O enquadramento nas automações de cobrança permanece independente da importação.

Ao tentar criar um acordo, o servidor calcula os valores e consulta a régua atual do condomínio para todos os recibos selecionados. Recibos com atraso menor que `inicio_cobranca_dias` exigem aprovação, inclusive vincendos, sem depender do checkbox de isenção de despesas. O banco usa a data de São Paulo; D+ igual ao início da régua já está dentro dela.

Quando necessária, a proposta é salva em `acordos_aprovacoes_fora_regua`, junto com os recibos fora da régua e os campos necessários para retomar a simulação. Uma pendência do tipo `aprovacao_acordo_fora_regua` aponta para essa proposta. Não há criação de acordo, parcelas ou envios durante essa etapa.

Na Central de Pendências, **Conferir proposta e decisão** abre a revisão. Somente gestor/admin com acesso à carteira pode aprovar ou rejeitar, com justificativa obrigatória. A decisão registra usuário e horário. Resolver ou limpar pendências genericamente não concede aprovação; esse tipo também fica excluído das ações em lote.

A aprovação compara os recibos, valores, despesas, entrada, tipo de acordo, processo e todos os pagamentos/vencimentos. Alterar essas condições gera outra proposta. Submissões repetidas das mesmas condições reutilizam o registro. A criação financeira confere e vincula a aprovação ao acordo na mesma transação, impedindo reuso. A aprovação não cria o acordo automaticamente: após a decisão, o operador retoma a proposta e efetiva o acordo.

## Instalação e verificação

Aplicar `20260924210000_aprovacao_acordo_fora_regua.sql` antes de publicar o aplicativo. A migração inclui a função financeira vigente com a verificação transacional. Ela passa a executar como definidora para acessar o registro protegido, validando explicitamente o perfil operacional e o acesso à carteira, além da correspondência de carteira, condomínio e unidade de cada recibo. As políticas atuais de produção dessas tabelas utilizam o mesmo escopo de carteira.

Validações:

- `node node_modules/tsx/dist/cli.mjs scripts/validate-aprovacao-fora-regua.ts`: migração e RPCs em PostgreSQL isolado (PGlite), com perfis de operador, gestor e leitura; idempotência; limite da régua; alteração de condições; rejeição; rollback; consumo único; auditoria e tentativa de liberar pela pendência genérica.
- `node node_modules/tsx/dist/cli.mjs scripts/validate-cota-mes.ts`: preserva os oito cenários de cálculo da isenção.
- `npm run typecheck` e `node node_modules/next/dist/bin/next build --webpack`.

O build local usa webpack porque o Turbopack recusa a junção de `node_modules` fora da raiz do worktree. A publicação usa as dependências instaladas no checkout de produção.
