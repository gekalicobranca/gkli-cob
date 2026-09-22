# Conciliação de produção — 22/09/2026

Base: `adf3cdf`, versão publicada antes desta conciliação.

## Código incorporado

- Parcelas de acordos carregadas em lotes, sem truncamento silencioso; exportação respeita repasse informado.
- Possível acordo e acordo firmado tratados como bloqueios na fila de cobranças.
- Sugestões na busca de condomínios.
- Painel e entrega Fiscal do Core, com fila persistente e processamento idempotente.
- Configuração administrativa de WhatsApp Web e exclusão desse transporte pelo dispatcher Cloud.
- Timbre Genske incluído no pacote da rota de PDF.
- Scripts locais de agentes, captação, WhatsApp Web e validação versionados.

## Produção preservada

Ativação automática e controles do Maestro, agrupamento/filtros de Flows, processamento compartilhado de relatórios e cron diário de relatórios foram preservados. A planilha operacional em `public/processos` não integra a publicação; arquivos desse diretório e perfis de sessão WhatsApp permanecem ignorados.

## Banco

As versões `20260918090000`, `20260918150000` e `20260918160000` não estavam registradas no histórico, mas seus objetos já existiam. Foram conferidos a política SELECT, as quatro funções de bloqueio, dois triggers habilitados, integrações nas reservas de e-mail e WhatsApp, permissões das funções e a FK com `ON DELETE SET NULL`.

O histórico foi reparado com `migration repair --status applied`, sem reaplicar os comandos SQL. `db push --dry-run --skip-vault --linked` confirmou banco atualizado, sem migrações pendentes.

A migração de ativação automática do Maestro, presente em produção e ausente na pasta local antiga, foi preservada. As migrações já aplicadas de Fiscal e WhatsApp Web foram incorporadas ao versionamento e ao snapshot de esquema.

## Verificação

- TypeScript sem erros.
- 16 testes de filtros, Fiscal, ativação do Maestro e fila WhatsApp Web aprovados.
- Exportações Excel verificadas, inclusive paginação de parcelas e repasse zero.
- Cinco testes do worker WhatsApp aprovados, sem transmissão real.
- Cinco testes de Maestro, relatórios, associação jurídica e Square aprovados.

## Operação

Nenhum envio de mensagem, fechamento fiscal ou emissão de documento foi executado como teste. Credenciais e disponibilidade do Core não foram testadas de ponta a ponta; os testes do cliente utilizam respostas simuladas. Publicar o código não reinicia workers locais. Não foi encontrado worker WhatsApp Web em execução durante a conciliação; conectar sessões e iniciar envios continua sendo uma operação separada.
