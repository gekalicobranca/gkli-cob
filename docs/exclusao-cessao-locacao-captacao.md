# Exclusão de cessão/locação de espaço na captação

Decisão do usuário em 25/11/2026: não captar essas rubricas em **nenhum condomínio**, incluindo Maestro, Easy Maestro, conversão manual e planilhas. A regra não depende do nome, administradora ou carteira. Não é uma limpeza retroativa dos registros existentes.

## Entrada e rastreabilidade

`features/importacoes/exclusao-cessao-espaco.ts` identifica a natureza por tipos estruturados e históricos/descrições de origem (incluindo acentos), sem inferir por nome do responsável, bloco ou unidade. Não confunde cessão de crédito ou locação de apartamento com cessão/locação de espaço. Recibos mistos são excluídos por inteiro: não se deduz uma rubrica do valor sem composição financeira autorizada.

O parser compartilhado filtra as prévias de cobranças e regenera CSV/XLSX só com as elegíveis. Os recibos excluídos permanecem completos em `preview_json.exclusaoCessaoEspaco.recibos`, junto do valor original da prévia e aviso com contagem. Totais operacionais são recalculados; a fonte original não é alterada. Cálculos de ranking são refeitos sem as rubricas excluídas. Reprocessar a prévia não duplica a evidência.

O Maestro/Easy Maestro usa a mesma conclusão. Prévias anteriores são revalidadas antes da conciliação. Se só houver exclusões, registrar conclusão com alerta e zero importações, sem limpar cobranças atuais nem montar flow. Prévia assinada do Easy que ainda contenha exclusões é recusada e deve ser gerada novamente, sem alterar a assinatura existente.

## Planilhas

A importação oficial preserva Natureza/Tipo de cobrança, Histórico/Descrição e Composição da origem, além das observações. Linhas identificadas ficam inválidas na prévia, com motivo, antes de criar unidades ou conciliar cobranças. Há nova verificação na execução e recusa de prévia antiga com exclusões antes de qualquer limpeza em lotes.

O leitor da planilha manual Easy v1 aceita opcionalmente a coluna N, cabeçalho **Natureza da cobrança** na linha 8. A coluna M de marcador continua independente. A exclusão ocorre antes da assinatura/plano de confirmação. Arquivo composto apenas de exclusões não autoriza substituição da base. Os modelos anteriores continuam compatíveis.

A segunda migration e `exclusao-cessao-conhecida.ts` recuperam a natureza já comprovada de um recibo mesmo quando uma planilha antiga omite a descrição. A identidade inclui condomínio, unidade, bloco e recibo completo, sem copiar valores. A consulta respeita RLS e é paginada; falha de consulta impede prosseguir. A barreira de INSERT e a validação transacional também conferem essa origem anterior.

Uma planilha que contenha só números, sem histórico/natureza nem recibo com origem conhecida, não permite determinar essa natureza. Não presumir cessão apenas porque a unidade é BUSS/BOX/CE; preservar a classificação no arquivo de entrada. Os exportadores do conversor eliminam as rubricas identificadas antes de gerar a planilha.

## Defesa no banco

As migrations `20261126023534_excluir_cessao_espaco_captacao_global.sql`, `20261126024203_excluir_recibos_cessao_origem_conhecida.sql` e `20261126024624_validar_exclusao_cessao_por_lote.sql` trocam a proibição específica do Villa Lobos por barreiras globais. O INSERT tem validação rápida das observações/flag, seguida por validação de origem anterior por comando, com transition table. A conferência por lote evita reler todo o relatório para cada linha. Carteira, condomínio, unidade, bloco e recibo delimitam a identidade. Não depende da comparação de nome com/sem acento.

Uma validação de conclusão em `conversoes_relatorio` também recusa prévia operacional com rubrica proibida; isso aborta integralmente o commit transacional do Easy mesmo quando ele reutiliza cobranças existentes, sem passar por INSERT. Funções não concedem acesso a dados nem usam SECURITY DEFINER. Não há UPDATE/DELETE de cobranças, acordos, mensagens ou flows na migration.

## Validação

- `scripts/validate-exclusao-cessao.ts`: paridade JS/SQL, origens estruturadas, negativos, recibo misto, idempotência, normalização XLSX e barreiras reais no Postgres/PGlite; recusa do commit Easy preservando base existente.
- Inclui lote sintético de 5.000 linhas contra histórico de 5.000 exclusões e rollback de lote misto. A rota de montagem reconhece conclusão sem cotas elegíveis para compatibilidade com workers antigos, sem criar flow.
- `scripts/validate-manager-composicao.ts`: parser real Manager, preservação de composição completa na evidência, exclusão do CSV e XLSX, valores das cotas elegíveis.
- `scripts/validate-easy-planilha-manual.ts`: compatibilidade do modelo e exclusão por natureza na coluna N.
- `scripts/validate-easy-cap-transaction.ts`: regressão da transação, rollback e replay.

Antes de afirmar conclusão operacional, conferir a migration aplicada no GKLI COB e o deployment Production READY com esta alteração. Não criar captação, mensagem ou pedido financeiro real para testar. A exclusão de registros antigos é um escopo separado.
