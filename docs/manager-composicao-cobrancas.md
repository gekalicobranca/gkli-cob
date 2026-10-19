# Composição das cobranças Manager / Atentum

O leitor de Cotas Pendentes preserva Conta, Histórico, principal e total de cada
componente até o fechamento de Total do Recibo. Os totais originais do recibo
continuam sendo a fonte dos valores da cobrança: os componentes não são somados
novamente para criar débitos adicionais.

`composicaoOrigem` mantém os itens e `tiposCobranca` mantém suas categorias, inclusive
quando o recibo mistura cota condominial, cessão/locação de espaço e consumo.
Descrições não reconhecidas permanecem como Outros, com o texto original.
A coluna de multa por atraso não classifica o débito como lançamento de multa.

A composição fica no preview da conversão e em `cobranca_parcelas.origem_linha_json`.
As observações da cobrança exibem os tipos e o detalhamento da origem. Na
conciliação de cobranças existentes, a atualização preserva notas humanas, valores,
status e vínculos; a escrita das observações confere o valor lido para detectar
alterações concorrentes. Parcelas são enriquecidas somente por cobrança, recibo e
vencimento correspondentes. Não há alteração de esquema, classificação judicial,
agenda, conteúdo de mensagens já preparado ou ativação de flows.

Validação: `node --import tsx --test scripts/validate-manager-composicao.ts`.
As verificações existentes de conversão Lello e reaproveitamento do Maestro Square
também foram executadas. A recuperação operacional do Villa Lobos usa o arquivo
original, correspondência única e backup local antes de complementar metadados.
