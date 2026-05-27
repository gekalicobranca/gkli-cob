# Sprint T1 — Templates Premium Operacionais

## Entregas

- Variáveis expandidas, incluindo `{{carteira}}` e `{{nome_carteira}}`.
- Templates globais e específicos por carteira.
- Resolução automática por hierarquia: template fixo → carteira → global → fallback GKLI.
- Categoria/situação do template separada da intensidade e do canal.
- Etapas de régua passam a apontar para uma situação de template, evitando régua presa a texto fixo.
- Biblioteca oficial GKLI inicial via SQL.
- Base de analytics em `mensagens_templates_metricas` e view `v_mensagens_templates_resolucao`.

## Hierarquia de seleção

1. Se a etapa tiver `template_id`, usa esse template.
2. Caso contrário, procura template ativo da carteira com mesma combinação:
   - tipo_regua
   - categoria
   - intensidade
   - canal
3. Se não encontrar, usa template global com a mesma combinação.
4. Se ainda não encontrar, usa fallback GKLI interno.

## Observação operacional

Os retornos continuam manuais nesta fase. A estrutura já permite que webhooks futuros de WhatsApp/e-mail alimentem as mesmas métricas e a mesma timeline.
