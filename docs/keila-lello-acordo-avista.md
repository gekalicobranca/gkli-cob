# Lello / Acob — acordo à vista supervisionado

Procedimento observado visualmente na gravação fornecida em 13/10/2026, duração 8m19s. Vídeo e documentos pessoais ficam fora do Git. Não autoriza lançamento financeiro no monitoramento diário.

1. Confirmar credencial específica, referência no cabeçalho, responsável e unidade. Conferir bloqueios humanos/judiciais e buscar acordos existentes, inclusive pendentes. Não repetir lançamento interrompido depois de `finaliza`.
2. Lello → Acob → COJUR → unidades → busca de unidades. Informar referência e unidade; abrir responsável correto (00:40–01:00).
3. Novo Acordo → selecionar somente recibos aprovados → conferir valores → próximo (01:00–01:20). Não selecionar outubro apenas por aparecer na lista.
4. Uma parcela. Conferir base, multa, juros, despesas e data padrão. No vídeo, `desconto despesas`, motivo `ADV EXTERNO`, zera despesas; depois um valor negativo em `Desconto` acrescenta encargos. Não copiar sinal ou valor automaticamente: isso é uma particularidade do portal. Comparar total com cálculo em centavos e condição aprovada.
5. `edita parcelas` → selecionar parcela → ajustar vencimento e tipo `BOLETO EXPRESS` → `altera parcela` → conferir → `finaliza edição` (02:40–03:40). Conferir data após cada recálculo.
6. Conferir soma, recibos e total. `finaliza` e confirmação do termo são formalização: devem ser concluídas pelo operador, após revisão concreta. Não automatizar assinatura/aceite contratual.
7. Acordos → busca acordos → referência/unidade/código → conferir status e parcela. Modelo `Amigável` → conferir termo → salvar PDF (04:20–06:40).
8. Detalhe → `emitir primeiro boleto` → conferir beneficiário, condomínio, unidade, acordo, parcela, valor e vencimento → salvar PDF original (07:20–08:19). Segunda via da cota corrente não substitui boleto de acordo.
9. Guardar termo e boleto privados com SHA-256, vincular ao caso e preparar resposta. Envio exclusivamente após aprovação autenticada na Keila; não enviar pelo portal.

## Dalvan já lançado

Safira 63004, unidade 600002, recibo de setembro 53235964, acordo 1398404, parcela 3347165, documento 3293525, vencimento 20/10/2026, total R$ 427,99. Não recriar. O vídeo mostra despesas zero e desconto -R$ 38,90 sobre R$ 389,09. Dez por cento arredondados produziriam R$ 428,00: preservar o documento real e sinalizar R$ 0,01 de divergência, sem alterar o acordo externo.

`scripts/lello/acordo-avista.mjs` prepara o plano e detecta divergências; não executa formalização. Seletores e retomada ainda precisam de validação no portal antes de habilitar criação automática. A captação existente permanece consultiva.

O operador autorizou em 13/10/2026 tolerância inclusiva de até R$ 0,50 para arredondamento, para mais ou para menos. Registrar a diferença e preservar o documento real; acima de R$ 0,50 exige revisão. Isso não autoriza diferença de recibos, vencimento, percentuais, descontos ou beneficiário.
