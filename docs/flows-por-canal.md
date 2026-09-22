# Flows de cobrança por canal

A mesma cobrança pode ter um Flow de e-mail e outro de WhatsApp. A criação verifica os canais das etapas ativas da régua e rejeita cobranças com vínculo ou mensagem pendente no mesmo canal. Réguas mistas ocupam todos os seus canais. Os vínculos antigos sem mensagens usam a régua como referência; vínculos sem canal identificável exigem revisão.

A lista de cobranças oferece apenas réguas com canais disponíveis. A montagem automática do Maestro continua usando e-mail e considera somente conflitos de e-mail. Uma montagem de e-mail pendente não impede preparar WhatsApp.

Em **Flow cobrança → Filtros → Tipo de comunicação**, é possível selecionar Todos, E-mail, WhatsApp ou Manual. O filtro acompanha os contadores, a seleção para ativação e o histórico. Flows mistos aparecem em cada canal correspondente.

**Criar pausados, sem agendar envios** gera mensagens pendentes de aprovação, com agenda vazia, e Flows em estado `pausado`. Essa preparação pode ocorrer com o canal desabilitado na carteira, sem mudar essa configuração. Não ativa o worker nem transmite mensagens.

Validação: `npx tsx --test scripts/validate-flow-canais.ts scripts/validate-flow-condominio.ts scripts/validate-flow-divisao.ts scripts/validate-maestro-flows.ts` e `npm run typecheck`.
