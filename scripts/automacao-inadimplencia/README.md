# Rotina de análise de inadimplência

Executa leitura, classificação e conferência financeira sem alterar os arquivos originais. O gerador de PDF usa configuração por condomínio e candidatos a vínculo por nome exato. A revisão visual e a validação dos vínculos continuam obrigatórias.

## Uso

`python analisar.py "arquivo.xls" --data-base 2026-09-11 --saida "analise.json"`

O interpretador deve disponibilizar Python 3. Não exige bibliotecas externas para análise. Na estação atual, o Python distribuído com o Codex foi validado.

Para repetir o PDF Co.Next: `python gerar_relatorio.py --config co_next.json`. O gerador precisa de `reportlab` e `pypdf`, disponíveis no Python do Codex. Para outro condomínio, criar configuração própria, conferir CNPJ e arquivos. O esquema da planilha processual é o das colunas A:S usado nos arquivos fornecidos. Pré-jurídico com correspondências exige validação adicional antes de gerar.

## Formatos validados

- HTML de recibos, como Villa Lobos Office Park.
- XLSX Hubert Cotas Atrasadas, inclusive quando salvo com extensão `.xls`, como Co.Next Liberdade.
- Outros formatos precisam de adaptador e conferência próprios. Não são silenciosamente tratados como um dos formatos conhecidos.

## Critérios persistentes

- Data-base explícita por análise; não usar a data de outro condomínio.
- Mais de 60 dias: vencimento estritamente anterior à data-base menos 60 dias.
- Mais de 5 anos: anterior à mesma data cinco anos antes; menos de 5 anos é estritamente posterior. Igualdade fica fora dos intervalos estritos.
- Separar taxa condominial, cessão, locação, pandemia não classificada e outros débitos pela descrição. A palavra `ACESSO` não corresponde a `CESSÃO`.
- Em Hubert, não ratear encargos do recibo entre naturezas: a origem não fornece essa separação.
- Em Hubert, históricos `COTA`, `C.` e `CONDOMINIO` da conta 1002 são cotas condominiais; o uso da conta é restrito ao adaptador desse formato.
- Valor ausente permanece ausente; não convertê-lo silenciosamente em zero.
- Desconto positivo só é invertido na análise se o histórico indicar desconto e a inversão reconciliar exatamente com o principal do recibo. Conservar valor exibido e justificativa.
- Reconciliar resumo, recibos e itens. Divergências devem aparecer no relatório; não forçar o fechamento.
- Contar unidades distintas, evitando somar contagens sobrepostas por natureza.

## Processos e PDF

1. Receber relação de processos própria do condomínio. Até isso ocorrer, situação judicial = não avaliada, e não "sem processo".
2. Conferir unidade, nome, natureza, número, situação e escritório. Não reutilizar mapas de outro condomínio nem vincular apenas por coincidências fracas de nomes.
3. Lidiane Genske Baia = Genske Advogados, conforme confirmação do solicitante. Preservar outros escritórios expressamente indicados.
4. Distinguir processo numerado, pasta de pré-distribuição, vínculo nominal a confirmar, histórico extinto/cancelado e ausência de correspondência.
5. Destacar movimentação recente em verde e suspensão em amarelo, com legenda; publicação recente não confirma isoladamente processo ativo.
6. Marcar saldo com mais de 5 anos e processo relacionado sem afirmar inclusão de cada vencimento nos autos.
7. Separar taxas condominiais dos demais débitos; colocar processos não relacionados a cobrança própria ao final.
8. Aplicar o papel timbrado fornecido em `C:/tmp/Cópia de Cartão-1.pdf`, reservar margens e inspecionar visualmente o PDF final.
9. Inserir na página inicial: "Relatório produzido com base em informações públicas e privadas, protegido pela LGPD e destinado somente para pessoas autorizadas. Não reproduzir esse conteúdo de forma parcial ou completa."

## Validação

`python testar.py`

Os testes de integração usam os arquivos locais usados no desenvolvimento. Confirmam os totais de dois formatos, a regra de cartão de acesso, o desconto, valores ausentes e os cortes de idade.
