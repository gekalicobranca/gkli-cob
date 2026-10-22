# Conferência Manager — Lidia/Cádiz

Habilitada somente para `lidia_atendimento`, condomínio Cádiz `47926d7c-030b-4469-8713-b23eda558a56` e carteira atual `36b6c087-56d2-4297-be63-6dcbe02a9f00`. Oásis continua sem condições confirmadas e não herda as regras do Cádiz.

O leitor aceita a exportação HTML com extensão `.xls` da Manager e planilhas XLSX com o mesmo esquema. Lê todas as tabelas/abas com números brasileiros e datas DD/MM/AAAA preservados, inclusive Windows-1252. Confere componentes, subtotais por recibo, totais por unidade, quantidade de unidades e total do condomínio, em centavos. Não aceita fonte truncada, recibo repetido, componente sem identificação ou total ausente.

A conferência exige coleta bem-sucedida e posição da fonte do mesmo dia, arquivo pertencente à execução, SHA-256 íntegro, nome do condomínio, bloco/unidade e responsável iguais ao cadastro e remetente igual ao contato da unidade. Cada vencimento precisa corresponder a uma cobrança canônica. Cota aberta ausente na fonte, duplicidade por vencimento, marcador judicial/acordo, multa por infração ou acordo existente impedem a proposta e exigem revisão. Não altera valores de cobranças ou acordos. Diferenças entre fonte atual e cadastro permanecem explicitamente na evidência para revisão.

Usa a régua e percentuais atuais do cadastro: Cádiz, 45 dias, 10% à vista, 20% parcelado e até três parcelas. Não herda a suspensão pré-2026 exclusiva do Safira. Restrições reais do cadastro e da fonte continuam obrigatórias. Vencimento à vista/primeira parcela dentro do período corrente de 11 a 10; validade de sete dias a partir do envio confirmado, conforme política existente.

O rascunho mostra a marca Lidia, cotas incluídas/excluídas e condições calculadas. A tela identifica Manager, recibo, tabela/linha e hash do arquivo. Na aprovação o servidor refaz a leitura, a conciliação e o cálculo; texto, regras, contato ou fonte alterados exigem nova versão. Monitor local reutiliza o mesmo serviço. Casos humanos, aprovados e rascunhos manuais continuam preservados; o serviço não envia, aprova, libera WhatsApp ou firma acordo.

Execução confiável para um atendimento elegível já vinculado à coleta:

```powershell
node --env-file=.env.local node_modules/tsx/dist/cli.mjs scripts/lidia-conferir-proposta.ts CASO_ID ARQUIVO_ID 3 AAAA-MM-DD
```

Testes: `scripts/validate-lidia-manager.ts` (HTML/XLSX, números, datas, identidade, recibos, totais, restrições, cálculo, revalidação e persistência exclusiva do rascunho) e regressão `scripts/validate-keila-conferencia.ts`. O arquivo real de 18/10/2026 fechou 79 recibos, 36 unidades e R$ 55.856,29; serve como auditoria do leitor, nunca como fonte atual para proposta nova.
