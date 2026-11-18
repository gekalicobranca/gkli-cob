# Decisões e acompanhamento das sprints de QA e performance

## Contexto

- Repositório: cópia local `gkli-cob-main`.
- Implementações de sprint permanecem locais até revisão explícita pelo fluxo GitHub → PR → Preview Vercel → produção.
- A Sprint 3 foi implementada na branch local `codex/sprint-3-query-performance`; seus arquivos ainda não foram integrados à `main`.

## Sprint 3 — consultas de cobranças e unidades

Na branch `codex/sprint-3-query-performance`:

- Resumos de cobranças e unidades acumulam valores e contagens por lote, sem manter todas as linhas em memória.
- Ordenações relacionadas de cobranças mantêm os candidatos necessários para a página e carregam os detalhes apenas dos registros da página.
- Validações focadas, ESLint, typecheck e `git diff --check` passaram na implementação local.
- A alteração diminui memória e payload, mas ainda percorre os resultados correspondentes. Não afirma transferir agregação e ordenação integralmente ao Postgres.

## Decisão adiada — agregados e ordenação diretamente no banco

**Não implementar agora RPCs de resumo nem migração da ordenação relacionada para SQL.** Primeiro medir a duração e o volume real das consultas e confirmar qual é o gargalo. Se os resumos forem o ponto crítico, migrar um resumo por vez, com comparação de equivalência. Depois, avaliar a ordenação relacionada.

O trabalho futuro precisa preservar:

- escopo por carteiras permitidas e políticas RLS;
- filtros de busca, operador, administradora, condomínio, unidade, status, datas, condução e judicialização;
- exclusão de cobranças arquivadas/duplicadas conforme as regras canônicas;
- subtotais em centavos e semântica de status;
- collation pt-BR com sensibilidade base, ordenação numérica e os desempates atuais;
- linhas com relações nulas e paginação/contagem coerentes.

Qualquer migration deve ser criada e validada apenas localmente, sem aplicação ao Supabase remoto nesta etapa.

## Sprint 4

### Política de CNPJ

- **Administradoras:** cadastro central/global; CNPJ preenchido válido e único após remover máscara. CNPJ continua opcional no banco para preservar registros legados, mas é obrigatório em novos cadastros e edições pelo formulário.
- **Condomínios:** CNPJ opcional. Quando informado em novos registros ou alterado, precisa passar na validação dos dígitos verificadores.
- **Unicidade de condomínio:** CNPJ normalizado único por carteira e administradora informada, com normalização de caixa e espaços no nome da administradora. O CNPJ pode se repetir em carteiras ou administradoras diferentes.
- **Teste/legado:** os CNPJs sintéticos vivem apenas nos testes locais. CNPJs ausentes em administradoras permanecem permitidos no banco. Foi identificado um condomínio legado com DV inválido; alterações sem mudança do CNPJ continuam permitidas, e a substituição por CNPJ válido é permitida. A migration aborta se encontrar duplicidades no escopo de unicidade.

### Auditoria somente de leitura do ambiente alvo

Consultas agregadas no Supabase associado a GKLI Cob confirmaram o schema: `administradoras.carteira_id` é opcional, `condominios.carteira_id` é obrigatório, e o vínculo de administradora do condomínio tem também o campo textual utilizado pelo formulário. Foram encontrados 17 registros de administradora, 2 sem CNPJ, nenhum CNPJ preenchido com DV inválido ou duplicado após normalização; nos 117 condomínios, nenhum CNPJ ausente, um CNPJ com DV inválido, e nenhuma duplicidade normalizada global ou dentro do escopo carteira/administradora. Nenhum dado foi alterado.

A migration e os guards da Sprint 4 foram preparados na branch local `codex/sprint-3-query-performance`. A decisão de mover agregados e ordenações para RPC/SQL continua adiada até medição de gargalo.
