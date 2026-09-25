# Hausy e Superlógica — layouts validados com Ateliê 365

## Inadimplência myHausy

Padrão `hausy-inadimplencia-cobrancas-v1`. Reconhece Inadimplência, Posição em, quantidade de unidades, seis colunas monetárias (original, principal, multa, atualização, juros, total), unidade/bloco e total do recibo. O nome do condomínio é dado operacional.

Uma linha por recibo, preservando bloco, zeros da unidade, responsável e vencimento. As contas da composição não geram novas cobranças. O motor confere as seis colunas contra a composição e o total por unidade, os encargos e o total acumulado. Leituras incompletas/divergentes são bloqueadas.

Usa posições do PDF para separar colunas: `IPTU 4/6` ao lado de `1.026,05` não pode se transformar em `61.026,05`. Os totalizadores usam a ordem do texto original, pois rótulos centralizados podem atravessar linhas. Mantém o recorte operacional por ano corrente.

Referência `365.pdf`: unidade A/000031, recibo 23091270, vencimento 10/09/2026, principal R$ 4.907,38, multa R$ 98,15 e total R$ 5.005,53. O PDF não informa CPF ou contatos pessoais.

## Relação de Condôminos Simplificada

Padrão `superlogica-condominos-simplificada-v1`. Lê as coordenadas das colunas Bloco, Unidade, Cliente, Nome e Agenda de contatos. Não usa a ordem do texto extraído para atribuir contatos a pessoas. Contatos no começo de outra página continuam no cadastro anterior até a próxima unidade.

Preserva unidades residenciais, lojas e vagas sem converter identificadores em números. Confere a quantidade declarada de condôminos. O código do cliente vai nas observações; não é CPF. O relatório não informa documento pessoal, vínculo ou tipo de imóvel, portanto o documento fica vazio, vínculo `nao_informado` e tipo `unidade`. Múltiplos contatos usam ` | `; telefones sem DDD são preservados sem completar dados.

Referência `RelatorioUnidades (4) (1).pdf`: 63 cadastros, emitido em 05/08/2026.

## Relatório de Unidades Completo

`RelatorioUnidades (8).pdf`, emitido em 18/09/2026, usa o padrão existente `superlogica-unidades-completo-v1`: 63 cadastros com CPF/CNPJ. Mantém a consolidação das continuações de página e os contatos adicionais nas observações. Corrigida a extração quando o PDF cola um endereço ao rótulo seguinte (`...com.brE-mail - ...`). Documentos pessoais são buscados apenas nas seções pessoais e do pagador, inclusive quando o rótulo vem colado em `FísicaCPF`, impedindo que o CNPJ do condomínio de um cabeçalho repetido seja usado como documento pessoal.

Os três XLSX usam CNPJ 64.934.001/0001-96, obtido nos relatórios de responsáveis. Cada arquivo é convertido independentemente; o simplificado não recebe os documentos pessoais do completo. Os dois arquivos de responsáveis são alternativas de importação da mesma base, sendo o completo mais recente e detalhado.

## Testes

`node node_modules/tsx/dist/cli.mjs scripts/validate-conversao-hausy.ts`

Para conferir também os PDFs, passe o diretório que contém os três arquivos como primeiro argumento. Os testes conferem os recibos, as planilhas e a correspondência de blocos/unidades, nomes e e-mails entre os dois relatórios de responsáveis. Os arquivos pessoais não são incluídos no repositório.
