# Grupos e operadores de condomínios

Aplicar `supabase/migrations/20260916010000_condominios_grupo_operador.sql` antes de publicar o código.

No cadastro do condomínio, o grupo é opcional. Digitar um nome novo cria o agrupamento; as sugestões apresentam os nomes usados nos condomínios acessíveis ao usuário. Os nomes são convertidos para maiúsculas e os espaços repetidos são removidos. O mesmo nome pode agrupar condomínios de carteiras diferentes, respeitando as permissões de consulta. Para retirar um condomínio do grupo, limpar o campo. Alterar o nome muda apenas o vínculo daquele condomínio, sem renomear os demais.

Em Gestão → Carteiras e usuários, o formulário de carteira permite definir o operador padrão. No condomínio, deixar o operador em branco herda esse padrão; selecionar um usuário substitui o padrão. A listagem e a ficha mostram o responsável efetivo e a origem. A atribuição não concede acesso: os vínculos de usuários às carteiras continuam controlando as permissões.

Novas cobranças sem operador explícito recebem o operador do condomínio ou, na ausência dele, o da carteira. Sem nenhuma definição, continuam sem operador. Alterações cadastrais não reatribuem cobranças históricas, acordos ou comissões. Os cadastros existentes começam sem grupo e sem operador específico.

Validação: `npx tsx scripts/validate-condominios-organizacao.ts` executa a migração em PostgreSQL embarcado e testa normalização de grupos, prioridade, fallback, preservação de atribuições explícitas e validação de perfis.
