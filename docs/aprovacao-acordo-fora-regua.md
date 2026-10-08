# Cotas fora da régua em acordos

A inclusão de cotas fora da régua não exige aprovação do gestor/admin. O acordo é criado diretamente, mantendo os flags de autorização existentes e as validações de acesso, seleção e valores. A confirmação `cota_mes_autorizada` continua obrigatória quando houver cotas selecionadas sem despesas.

Aplicar `20261006185625_remover_aprovacao_acordo_fora_regua.sql` para remover também o bloqueio na função financeira do banco. Registros antigos de aprovação permanecem como histórico e podem ser retomados, sem exigir decisão do gestor. A aprovação do síndico por limite de parcelas continua seguindo sua regra própria.

Validação: `node node_modules/tsx/dist/cli.mjs scripts/validate-aprovacao-fora-regua.ts` cobre o fluxo anterior e a migração que elimina a exigência, preservando o controle de acesso.
