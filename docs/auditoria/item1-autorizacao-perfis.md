> Atualização de publicação: correções disponíveis em produção em 02/11/2026. Evidências em [registro da publicação](publicacao-autorizacao-itens-1-3-2026-11-02.md). O relato local abaixo registra a etapa anterior.

# Auditoria de autorização e perfis - item 1

Data: 02/11/2026. Branch: `codex/auditoria-autorizacao-perfis`.
Estado: correção local, sem publicação e sem migração aplicada em produção.

## Fonte autoritativa

`Auth.getUser().id -> loadTrustedProfile -> profiles.id/role -> getCurrentUser /
requireAuthenticatedApiUser -> requireUser / requireAdmin / requireRole /
requireGestor / getPermittedCarteiras -> consumidores`.

Somente `admin`, `gestor`, `operador`, `leitura` e `sindico` são aceitos, com
correspondência exata. Metadados do Auth permanecem apenas para nome de exibição.
Perfil ausente, nulo, desconhecido ou com ID divergente não autoriza acesso.
APIs retornam 401 para ausência de sessão, 403 para perfil inválido e 503 para
falha de consulta. Páginas/actions redirecionam ao login sem conceder papel padrão.

## Correções

- Eliminados fallback de papel por metadados, papel padrão e aliases manager/owner.
- Helpers de escopo sem contexto passaram a aplicar filtro vazio.
- Login geral e de síndico validam perfil persistido e encerram sessão incompleta.
- APIs compartilhadas, downloads e consultas diretas de papel usam o mesmo contrato.
- Ranking/exportação de captação autorizam pela carteira persistida na conversão.
- As 14 ações de captação exigem papel no servidor antes de efeitos. Controle global,
  iniciar/parar worker e limpeza exigem admin/gestor; demais ações, admin/gestor/operador.
  Restrições de carteira e RLS continuam aplicáveis.
- Logs estruturados registram inconsistências e negativas dos guards, sem conteúdo de
  metadados, e-mail, token ou mensagem interna do banco. Não foi criado repositório
  durável de auditoria; retenção depende da infraestrutura de logs do servidor.

## Banco e provisionamento

Migração: `supabase/migrations/20261102174734_trusted_profile_authorization.sql`.

RLS de profiles é explicitamente habilitada. Trigger impede usuário comum de inserir
perfil ou alterar ID, e-mail e papel; edição de nome continua permitida conforme RLS.
Admin confiável e service_role preservam provisionamento administrativo. O helper SQL
de carteira exige perfil válido e vínculo; somente admin confiável mantém escopo global.

`handle_new_user` deixa de criar perfil automaticamente: uma conta do Auth, por si só,
não concede acesso ao app. Os dois fluxos administrativos existentes já fazem upsert
explícito do perfil, protegido por requireAdmin. Removida a gravação de papel nos
metadados. Falha entre criação do Auth e gravação de profiles deixa conta sem acesso;
o administrador deve reparar explicitamente o perfil/vínculo ou repetir o cadastro.
Não há recuperação de papel por metadados. Recuperação/redefinição de senha não altera papel.

Nenhum papel ou vínculo existente é reescrito. A restrição de papéis obrigatórios usa
NOT VALID para preservar registros históricos incompletos, mas verifica futuras
inserções/atualizações. Esses registros devem ser inspecionados e reparados com fonte
administrativa confiável antes de validar a restrição integralmente.

## Evidências e reprodução

- `npm run test:auth`: 23 testes com módulos TypeScript reais e Supabase/redirect
  simulados, além de migração SQL real executada em PGlite com papéis e RLS.
- `node scripts/audit-auth-consumers.cjs`: inventário estático reproduzível. Na revisão:
  228 arquivos, 338 dependências diretas dos controles. Não representa teste E2E
  individual de cada consumidor.
- TypeScript: aprovado em 911 arquivos de código, incluindo o novo helper, com configuração
  temporária derivada de tsconfig.json. A execução inicial irrestrita excedeu 4 GB de
  heap porque incluiu milhares de arquivos em cópias locais ignoradas (.codex-tmp,
  .local e output). A verificação subsequente cobriu o código entregue, sem essas cópias.
- ESLint: aprovado nos arquivos TypeScript alterados, novo helper e scripts de testes/
  inventário. `git diff --check`: aprovado. Não foi executado build com arquivos de ambiente.
- Matriz: perfis ausentes/nulos/inválidos, metadado privilegiado, conflito de fontes,
  cinco papéis legítimos, guards admin/role/gestor, carteiras vazias, falha de consulta,
  ID divergente, logins, APIs, carteira persistida nas exportações e 14 ações de captação.
- SQL: autoelevação, troca de ID/e-mail, edição legítima do nome, edição de terceiro,
  inserção não autorizada, admin/service_role, anônimo, carteira permitida/proibida,
  perfil incompleto/ausente e criação de Auth com metadado privilegiado.

Os testes usam dados sintéticos. Não comprovam ausência de exploração prévia nem o
estado do banco implantado. A definição anterior de handle_new_user não estava nos
arquivos locais; a migração a substitui explicitamente. Outras funções SQL com escrita
privilegiada, grants adicionais e triggers existentes no ambiente precisam de revisão
na homologação. Advisors do Supabase não foram executados em ambiente remoto.

## Checklist de homologação e ativação

- [ ] Conferir definição/triggers de Auth e permissões do banco implantado.
- [ ] Conferir papéis existentes, especialmente admins e perfis ausentes/nulos, sem inferir de metadados.
- [ ] Testar criação/edição de usuário e síndico com falha intermediária simulada.
- [ ] Confirmar acesso positivo/negativo de cada papel em carteiras distintas.
- [ ] Validar portal síndico, dashboards, automações autenticadas e exportações.
- [ ] Executar advisors no Supabase de homologação e verificar retenção dos logs.
- [ ] Publicar aplicação e aplicar migração em janela coordenada; os dois são necessários.

Não reverter para fallback por metadados. A reversão da proteção de profiles reabre
o risco; preferir correção progressiva após revisão. Dados de cobrança, acordos,
pagamentos e repasses não foram alterados por esta tarefa.
