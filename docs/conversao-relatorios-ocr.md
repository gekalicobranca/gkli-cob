# Conversão de relatórios — política de OCR

O GKLI Cobrança não executa OCR dentro do app principal.

## Motivo

OCR no runtime da aplicação aumenta risco operacional, tempo de processamento e dependência de binários de sistema que não estão disponíveis de forma confiável na Vercel padrão.

## Regra atual

1. O conversor tenta extrair texto nativo do PDF.
2. Se o texto for legível e o padrão for reconhecido, a importação é gerada.
3. Se o texto vier corrompido ou sem estrutura suficiente, o PDF é descartado com mensagem orientativa.
4. O usuário deve tratar o PDF externamente e reenviar um PDF pesquisável, ou usar planilha gerada pelo sistema de origem.

## Tratamento externo recomendado

- NAPS2, para operação manual no Windows.
- OCRmyPDF, para automação local ou microserviço separado.
- Adobe Acrobat Pro, quando disponível.

O OCR externo deve gerar um PDF pesquisável, preservando a estrutura tabular sempre que possível.
