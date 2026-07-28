# Backup e recuperação do GKLI Cobrança

## Objetivo

- RPO normal: até 24 horas de dados, reduzível com PITR do Supabase.
- RTO alvo: até 2 horas após provisionar um novo projeto.
- Proteger banco, usuários do Auth, objetos do Storage e uma cópia reconstruível do app.
- Manter a cópia fora do projeto Supabase e sempre criptografada.

O workflow `.github/workflows/supabase-backup.yml` executa diariamente às 00:17
no horário de Brasília (03:17 UTC). Ele gera dumps separados de papéis, schema e
dados, copia todos os buckets do Storage, inclui um `git bundle`, cria checksums,
criptografa tudo com AES-256/PBKDF2 e envia somente o pacote criptografado a um
bucket S3 independente.

## Preparação única

1. No Supabase, use a URL do **Session pooler** do projeto e guarde-a como o
   secret `SUPABASE_DB_URL` no GitHub.
2. Em Storage > Configuration > S3, habilite S3 e gere credenciais exclusivas
   para backup. Cadastre endpoint, região e chaves nos secrets com prefixo
   `SUPABASE_STORAGE_`.
3. Crie um bucket em outro provedor ou outra conta, com:
   - versionamento;
   - bloqueio contra exclusão/imutabilidade, se disponível;
   - criptografia do provedor;
   - regra de retenção: 7 diários, 4 semanais e 12 mensais;
   - credencial limitada a gravar/listar somente esse bucket.
4. Cadastre os secrets `BACKUP_S3_BUCKET`, `BACKUP_S3_REGION`,
   `BACKUP_AWS_ACCESS_KEY_ID` e `BACKUP_AWS_SECRET_ACCESS_KEY`.
   `BACKUP_S3_ENDPOINT` só é necessário para provedores S3 compatíveis que não
   sejam AWS.
5. Gere uma frase longa e aleatória para `BACKUP_ENCRYPTION_PASSPHRASE`. Guarde
   uma segunda cópia no gerenciador de senhas corporativo, fora do GitHub.
6. Execute manualmente o workflow e confirme que os arquivos `.backup.enc` e
   `.sha256` chegaram ao cofre.

Nunca reutilize as credenciais de produção no bucket de destino. O operador do
app não deve ter permissão para apagar backups.

## Restauração de emergência

1. Preserve o projeto com falha para investigação; não faça a restauração por
   cima dele.
2. Crie um projeto Supabase novo na mesma região e versão principal do Postgres.
3. Baixe do cofre o pacote `.backup.enc` e seu `.sha256`.
4. Instale `psql`, AWS CLI e OpenSSL. Exporte a frase de criptografia.
5. Execute:

   ```bash
   export BACKUP_ENCRYPTION_PASSPHRASE='obtida-do-cofre'
   export TARGET_STORAGE_ENDPOINT='https://NOVO_REF.storage.supabase.co/storage/v1/s3'
   export TARGET_STORAGE_REGION='regiao'
   export TARGET_STORAGE_ACCESS_KEY_ID='...'
   export TARGET_STORAGE_SECRET_ACCESS_KEY='...'
   npm run backup:restore -- /caminho/arquivo.backup.enc \
     'postgresql://postgres.NOVO_REF:SENHA@POOLER:5432/postgres'
   ```

6. Atualize na hospedagem do app:
   `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` e
   `SUPABASE_SERVICE_ROLE_KEY`.
7. Reconfigure no painel do Supabase os itens que não são dados Postgres:
   URLs de Auth, provedores OAuth, SMTP, secrets de Edge Functions, webhooks,
   integrações e tarefas agendadas externas.
8. Faça o teste de aceite abaixo antes de trocar DNS/tráfego.

## Teste de aceite

- login de um usuário de teste;
- contagem das tabelas críticas e conferência de condomínios/cobranças/acordos;
- download de ao menos um arquivo privado de cada bucket;
- criação e leitura de um registro descartável;
- execução de uma rotina de mensageria em modo seguro;
- build do commit indicado em `manifest.json`;
- registro do horário de início/fim e das divergências.

## Ensaio obrigatório

Uma vez por mês, restaure o backup mais recente em um projeto temporário, execute
o teste de aceite e depois elimine o ambiente temporário conforme a política
interna. Um backup só é considerado válido depois desse ensaio.

## Exportação manual pelo app

Administradores também podem abrir **Configurações > Backup de segurança** e
baixar um ZIP de emergência. O pacote contém:

- um CSV UTF-8 por tabela pública;
- `schema-current.sql`, produzido a partir do catálogo atual do Postgres;
- as migrações SQL versionadas e `config.toml`;
- `manifest.json`, com contagem e situação de cada tabela;
- `LEIA-ME.txt`, com instruções de reconstrução.

Essa exportação é complementar ao backup automático. Como o ZIP manual não é
criptografado pelo navegador, ele deve ser transferido imediatamente para um
cofre criptografado e excluído da pasta comum de downloads.

## Limites e decisões

- O backup nativo do banco Supabase não contém os arquivos do Storage.
- O script inclui dados de Auth no dump lógico, mas chaves, secrets e
  configurações do painel precisam existir no cofre operacional.
- `git bundle` evita depender apenas do repositório GitHub para reconstruir o
  app; imagens de deploy e variáveis da hospedagem ainda devem ser geridas pelo
  provedor e pelo cofre de segredos.
- Para perda admissível menor que 24 horas, habilite PITR no Supabase. O backup
  externo continua necessário para falha de conta, exclusão e independência do
  fornecedor.
