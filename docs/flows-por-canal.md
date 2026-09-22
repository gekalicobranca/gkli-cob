# Flows de cobrança por canal

A mesma cobrança pode ter um Flow de e-mail e outro de WhatsApp. A criação verifica os canais das etapas ativas da régua e rejeita cobranças com vínculo ou mensagem pendente no mesmo canal. Réguas mistas ocupam todos os seus canais. Os vínculos antigos sem mensagens usam a régua como referência; vínculos sem canal identificável exigem revisão.

A lista de cobranças oferece apenas réguas com canais disponíveis. A montagem automática do Maestro continua usando e-mail e considera somente conflitos de e-mail. Uma montagem de e-mail pendente não impede preparar WhatsApp.

O menu **Flows** possui duas áreas: **Cobrança · E-mail** (`/app/flows/cobranca/email`) e **Cobrança · WhatsApp** (`/app/flows/cobranca/whatsapp`). O canal é fixado pela rota antes da consulta, inclusive nos contadores, na seleção para ativação e no histórico. Filtrar, limpar filtros, exportar saneamento e ativar cobranças preservam o canal. O endereço antigo redireciona para e-mail por padrão ou para WhatsApp quando recebe `canal=whatsapp`, preservando os demais parâmetros.

O filtro dos flows ocorre no banco antes da paginação e considera mensagens, canais gravados no payload e a régua para preservar os vínculos legados. A consulta retorna no máximo uma mensagem por canal de cada Flow, sem carregar todas as mensagens apenas para descobrir os canais. Cobranças novas e ativas continuam compartilhadas quando são elegíveis às réguas das duas áreas; carteiras sem régua do canal são excluídas da consulta. Cadastros sem contato continuam disponíveis para saneamento.

Flows e réguas mistos continuam presentes em cada canal correspondente; suas ações operam sobre o Flow inteiro. A montagem e as pendências do Maestro, específicas de e-mail, aparecem apenas na área de e-mail.

## Navegação e carregamento

A abertura padrão é **Acompanhar**, com até 30 flows por página, filtros de status, carteira, condomínio e data de criação. Os indicadores e a seleção em lote referem-se à página exibida. **Histórico** consulta separadamente os flows concluídos e cancelados, também com paginação no banco. A fila de mensagens só é buscada quando o Flow é aberto.

**Gerar flows** exige escolher um condomínio antes de consultar cobranças e vínculos de canais. Após gerar, a navegação retorna para Acompanhar no mesmo condomínio. A ativação de cobranças retorna para Gerar flows e não inclui uma lista extensa de IDs na URL.

Cada aba carrega apenas seus próprios dados. **Saneamento** não consulta flows nem vínculos de mensagens, exibe 50 cobranças por página e exporta todos os registros dos filtros aplicados. Sua consulta ainda avalia o conjunto completo de cobranças filtradas para conferir pendências atuais. **Maestro** só é consultado ao abrir sua aba. A troca de abas não faz pré-carregamento das consultas das demais áreas.

**Criar pausados, sem agendar envios** gera mensagens pendentes de aprovação, com agenda vazia, e Flows em estado `pausado`. Essa preparação pode ocorrer com o canal desabilitado na carteira, sem mudar essa configuração. Não ativa o worker nem transmite mensagens.

Validação: `npx tsx --test scripts/validate-flow-areas.ts scripts/validate-flow-canais.ts scripts/validate-flow-condominio.ts scripts/validate-flow-divisao.ts scripts/validate-maestro-flows.ts` e `npm run typecheck`.
