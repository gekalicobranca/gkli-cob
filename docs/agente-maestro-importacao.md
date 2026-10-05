# Validação e importação do Maestro

Os disparos de Executar agora (`maestro`), Agendar (`maestro_agendada`) e da agenda mensal (`agenda_mensal`) concluem conversão e importação após o upload do relatório. Outras origens mantêm a validação manual.

Publique o aplicativo com a rota `/api/agente-automatico/execucoes/[id]/concluir` e atualize/reinicie os workers remotos. No ambiente dos workers, configure `CAPTACAO_MAESTRO_URL` com a URL do aplicativo e `CAPTACAO_ORQUESTRADOR_SECRET` com a mesma credencial configurada no servidor. Os fallbacks existentes para URL e segredo continuam disponíveis.

A conclusão do Maestro independe de `CAPTACAO_AUTOMATIZADA_CONFIRMAR`. Os relatórios dessas execuções ficam em `Downloads/maestro/<execucao>` (ou na pasta configurada em `AGENTE_DOWNLOAD_DIR`), evitando uma segunda conversão pelo observador de Downloads. A conversão usa o ID do arquivo e reutiliza o confirmador existente, sem limpar cobranças anteriores. Falhas interrompem a conclusão e aparecem no histórico da execução. Não há chamada adicional de envio de mensagens.

Execuções antigas sem identificação de origem do Maestro mantêm o comportamento anterior.

Com a captação desligada no Maestro, os agentes continuam aceitando e processando pedidos manuais pela página de Agentes, por administradora ou por worker. Agendamentos manuais respeitam o horário escolhido. As origens `maestro`, `maestro_agendada` e `agenda_mensal` ficam pausadas até a captação ser ligada novamente. Atualize o aplicativo e reinicie os workers remotos para aplicar esse comportamento.

Verificação local sem dados reais:

```sh
node scripts/validate-maestro-automatico.mjs
node scripts/validate-agente-maestro-pausado.mjs
npx tsx scripts/validate-maestro-conclusao.ts
npm run typecheck
```
