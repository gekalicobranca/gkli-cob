# Exportação de configuração para GKLI-FLOW

Acesso: **Flows → Exportar para GKLI-FLOW**, disponível para administradores.
Clique em **Preparar exportação e validar**, confira as contagens e alertas e clique em **Baixar JSON**.
O download usa exatamente os dados exibidos no resumo, sem uma segunda consulta.

Geração local usando as configurações do ambiente atual:

```powershell
node --env-file=.env.local node_modules/tsx/dist/cli.mjs scripts/export-flow-config.ts
node node_modules/tsx/dist/cli.mjs scripts/validate-flow-config-export.ts output/gkli-flow-config-export-YYYY-MM-DD.json
```

O arquivo é salvo em `output/`. O envelope usa schema `gkli-flow-config-export`, versão `1.0`, data UTC e origem `gkli-cob`; o nome do arquivo usa a data de São Paulo.
Os registros preservam IDs e referências originais, `source_id` e `source_system`. Campos das tabelas de configuração mantêm seus nomes originais.
Templates ativos e inativos e conteúdo de etapas são preservados sem renderização; analytics de templates são excluídos.

Fontes: `mensagens_templates`, `reguas`, `regua_etapas`, `integracoes_smtp_config`, identificadores e configurações de canais das carteiras, identificação de `whatsapp_web_sessoes`, habilitação de `whatsapp_worker_controles` e `regua_compliance_regras`. SMTP e WhatsApp Cloud globais vêm do ambiente do processo que gera o arquivo. Parâmetros lógicos de workers, retry e orçamento dos jobs vêm da implementação atual.

Senhas e chaves sensíveis em configurações aninhadas são substituídas por `{ "secret_required": true }`. Tokens OAuth, credenciais de sessão, cookies, QR, controles de reinício e heartbeat não são lidos. As sessões precisam de novo pareamento.

O campo `codigo` das carteiras não existe no banco atual: exportado como `null`, com aviso. Dados fiscais e cadastro completo de carteiras não são exportados.
Parâmetros de workers executados em outros processos ou com arquivos de ambiente próprios devem ser conferidos nesses ambientes. A leitura é paginada e não constitui snapshot transacional; execute em período sem edição das configurações.
Falha em qualquer fonte cancela a geração, evitando exportação parcial. Avisos de referências não impedem o download. A rotina não grava no banco e não consulta histórico operacional.
