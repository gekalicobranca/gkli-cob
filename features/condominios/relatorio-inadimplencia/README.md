# Relatório padrão da aba Rankings

O PDF usa o timbre em `public/templates/genske-papel-timbrado.pdf` e mantém o download XLSX existente. Cada ranking salva seu próprio conjunto de fontes em `conversoes_relatorio.preview_json`, sem modificar cobranças, parcelas ou baixas.

Nas próximas captações, os originais reconhecidos são analisados antes do recorte operacional de vencimentos. Os formatos detalhados validados são o HTML XLS CondoPro (Villa Lobos) e o XLSX Hubert, inclusive quando tem extensão XLS e dimensão incorreta (Co.Next). Outros formatos e rankings antigos continuam disponíveis como resumo; a interface informa quando faltam dados para calcular natureza e idade.

Em **Atualizar fontes do relatório**, o operador pode anexar o original, a planilha de processos (mesmo esquema das relações usadas na análise) e o controle pré-jurídico. Processos são restritos ao CNPJ do cadastro; o controle pré-jurídico é filtrado por CNPJ. Os arquivos são lidos como dados. A fonte anterior só é substituída após validação e geração bem-sucedidas, com controle de atualização concorrente. A autorização usa a carteira persistida no registro.

Os cálculos usam centavos inteiros e vencimentos individuais. Mais de 60 dias e mais de 5 anos são limites estritos; a faixa intermediária exclui ambos os limites. Valores sem discriminação não são rateados. Ausência de correspondência não significa ausência de processo; processos extintos não recebem destaque verde. Correspondência por nome é candidata, e unidade expressamente descrita é marcada U. Lidiane corresponde a Genske conforme orientação do solicitante.

Validação: `npx tsx scripts/validate-relatorio-inadimplencia.ts`. Opcionalmente, fornecer caminho do original, caminho da relação de processos, CNPJ e caminho do PDF de conferência. Fontes privadas não devem ser adicionadas ao repositório.

Associação: `marcacaoAutomaticaPermitida=false` proíbe afirmar a abrangência do saldo, mas não elimina uma referência nominal ou uma unidade explícita. Títulos `Condomínio x Parte` e `Condomínio - UNIDADE - 504 B` são interpretados somente quando identificam o condomínio da fonte financeira. A comparação nominal tolera acentos e sufixos empresariais finais; não faz aproximação livre de nomes. Correspondência nominal com unidade divergente permanece N. Encerrado é estado histórico.

Conferências operacionais podem ser registradas em `ContextoRelatorio.conferenciasUnidades`, com unidade, bloco, situação, data, fonte e ressalva. Elas pertencem à posição financeira do relatório e são exibidas como J-C/D-C, sem inventar números de processo nem substituir os dados originais do Jur. Uma conferência de pré-distribuição tem precedência no agrupamento, pois um processo nominal não demonstra que as cotas conferidas foram ajuizadas. Os valores da conferência não substituem os recibos captados. Testes destas regras: `npx tsx scripts/validate-associacao-relatorio.ts`.
