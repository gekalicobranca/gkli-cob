# Conversor Hflex / LiveFacilities — Unidades v2

## Objetivo

Converter PDFs de **Relatório de Unidades** no padrão Hflex / LiveFacilities para a planilha oficial de importação de unidades do GKLI Cobrança.

A saída gerada mantém exclusivamente as colunas aceitas pelo importador:

- `condominio_cnpj`
- `identificacao`
- `bloco`
- `tipo`
- `responsavel_nome`
- `responsavel_documento`
- `telefone`
- `email`
- `status`
- `observacoes`

## Padrões tratados

### Layout Hflex / LiveFacilities

O parser reconhece relatórios com sinais como:

- `RELATÓRIO DE UNIDADES`
- `PROCESSADO EM`
- `BLOCOS: ... UNIDADES: ...`
- linhas de unidade no formato `000301 OFFICE`, `000051 CIPÓ`, etc.
- vínculos `PROPRIETÁRIO`, `CO-PROPRIETÁRIO` e `INQUILINO`
- `TIPO PESSOA`, `CPF`, `CNPJ`
- `TELEFONE COMERCIAL/RESIDENCIAL/CELULAR`
- `E-MAIL COMERCIAL/PESSOAL`

### PDFs com glifos duplicados

Alguns PDFs do padrão Hflex/LiveFacilities trazem texto extraído como:

- `RREELLAATTÓÓRRIIOO`
- `PPRROOPPRRIIEETTÁÁRRIIOO`
- `CCPPFF`

O conversor aplica correção linha a linha somente quando detecta forte padrão de caracteres adjacentes repetidos.

## Regra de qualidade

O conversor não usa OCR.

Se o PDF vier com texto corrompido, encoding inseguro ou sem estrutura mínima reconhecível, o arquivo é descartado com mensagem clara. Isso evita gerar importações tortas.

## Seleção do responsável

Quando há mais de uma pessoa vinculada à mesma unidade, a prioridade é:

1. Proprietário
2. Co-proprietário
3. Inquilino

Os demais vínculos aparecem nas observações.

## Saída

A aba do XLSX gerado é `DADOS`, igual ao template oficial de importação de unidades.

## Observação importante

Arquivos visualmente corretos, mas sem texto extraível confiável, devem ser reenviados em uma versão PDF gerada diretamente pelo sistema de origem. Imagem, scan ou fonte sem mapa de texto confiável não é importada nesta fase.
