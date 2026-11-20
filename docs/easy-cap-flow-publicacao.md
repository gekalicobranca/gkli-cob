# Publicação — Easy Cap com montagem opcional de Flow

Candidata preparada pelo chat Dev Easy no commit `e055df2a`, branch já existente `codex/easy-cap-flow`. A main `90dce976` (Sprint 1 do Review) foi incorporada por merge normal, preservando as duas entregas. Não foi criada branch nesta publicação.

## Comportamento e limites

Na prévia, a opção de montar o Flow começa desmarcada. O operador confere régua, canais e conta de e-mail aplicáveis ao condomínio. Após o recibo de captação, a configuração é revalidada e a execução é vinculada à conversão confirmada pelo mesmo operador, condomínio e carteira. Repetir recupera a mesma execução; outra execução aberta ou captação mais recente exige conferência. As partes usam a montagem transacional existente e ficam pausadas até a liberação explícita do operador. Uma falha na montagem não transforma a captação concluída em falha nem autoriza nova importação.

## Banco

Alvo: **GKLI - COB**, ref `vjcmotflmcczoepflhwc`. Pré-checagem em leitura encontrou 320 migrations, retenção P2 instalada, nova versão pendente e pré-requisitos presentes. Única migration deste pacote: `20261120013000_easy_flow_apos_captacao.sql`. Ela adiciona `captacao_id`, FK para o recibo, índice único parcial e RPC privada de início por captação. É aditiva, não executa importação, montagem, liberação, agendamento ou limpeza.

Aplicar pelo CLI com alvo explícito, `--skip-vault`, sem seeds/roles, somente se o dry-run listar essa versão. Conferir depois: histórico, FK, índice único, função security invoker/search_path vazio, permissão negada a anon/authenticated e concedida a service_role. Preservar RLS e execuções existentes. A instalação precede o consumidor web.

## Verificação e implantação

A preparação original registrou 51 testes, TypeScript, teclado em tela de 320 px e replay estrutural em PostgreSQL isolado. Nesta publicação, repetir as suítes de Cap/Flow incluindo integração e fronteiras; o lint dirigido aos dez arquivos alterados passou sem erros. Registrar os resultados finais, aplicação da migration e SHA no PR da publicação.

Fluxo: GitHub → PR → quality (TypeScript/build) e Preview aprovados → merge → Production READY e alias no SHA de main. Smoke de produção somente em leitura. Não importar, montar Flow ou enviar mensagem real para testar. Os pedidos Maestro retidos e o Flow legado não fazem parte desta intervenção. Uma falha mantém recibos e pendências para conferência; não executar down migration ou retry cego.

## Resultado da janela de banco e regressão

Em 20/11/2026, o CLI 2.117.0 executou dry-run e aplicação com alvo explícito GKLI - COB (`db push --project-ref vjcmotflmcczoepflhwc --skip-vault --yes`). Somente `20261120013000_easy_flow_apos_captacao.sql` foi listada/aplicada, sem seeds/roles. Histórico passou de 320 para 321 versões. Pós-check em leitura confirmou a FK para o recibo, índice parcial único e válido, RLS mantida e RPC security invoker, search_path vazio e lock_timeout 5s; anon/authenticated sem EXECUTE, service_role com EXECUTE. Advisor manteve as contagens anteriores 25/2/27/1.

A regressão repetida nesta janela passou com **46 testes** em cinco suítes: integração Cap/Flow, fronteiras do Cap, transação Cap, transação Flow e fronteiras do Flow. Cobriu perda de resposta, consulta do recibo, autorização, rollback, concorrência, preservações e montagem pausada sem agenda. Lint dirigido passou sem erros e `git diff --check` passou. A revisão final ainda exige quality e Preview antes do merge; o resultado do deploy e alias será registrado no PR.

Nenhuma captação, montagem, liberação ou envio foi executado sobre dados reais como teste. A migration é aditiva e mantém os caminhos antigos disponíveis. A publicação web não atualiza o runtime local fixado do Espelhar; esse executor e seu ajuste local preservado não foram alterados nesta janela.
