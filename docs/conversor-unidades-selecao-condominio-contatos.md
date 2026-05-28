# Conversor de unidades — seleção de condomínio e contatos

## Objetivo

A conversão de PDFs de unidades não deve depender exclusivamente do CNPJ extraído do relatório. Em especial nos padrões Hflex / LiveFacilities, o PDF pode trazer apenas o nome operacional do condomínio ou texto com qualidade irregular.

O fluxo correto passa a ser:

1. O operador envia o PDF.
2. O parser detecta o padrão do relatório e tenta identificar o nome do condomínio no arquivo.
3. O app sugere condomínios cadastrados por aproximação de nome oficial e nome operacional.
4. O operador escolhe o condomínio correto.
5. O conversor reprocessa o arquivo e gera o XLSX com `condominio_cnpj` vindo do cadastro do GKLI.

## Regras de seleção do condomínio

- O CNPJ usado no XLSX final vem do cadastro do condomínio, não do PDF.
- Para Superlógica, o CNPJ do cabeçalho continua sendo útil para conferência, mas a confirmação do cadastro permanece disponível.
- Para Hflex / LiveFacilities, a confirmação pelo usuário é o caminho principal.
- Sem condomínio confirmado, o download do XLSX/CSV fica bloqueado.

## Regras de contato

Campos principais:

- `telefone`: primeiro celular encontrado.
- fallback de telefone: celular → comercial → residencial → outros.
- `email`: primeiro e-mail encontrado.

Campos excedentes:

- telefones adicionais vão para `observacoes`.
- e-mails adicionais vão para `observacoes`.
- código cliente, tipo pessoa, papel/vínculo e alertas também ficam em `observacoes`.

## Motivo da decisão

Essa abordagem mantém a importação de unidades simples e compatível com o template oficial do GKLI, mas preserva informação útil para conferência operacional.

Evita também importações erradas quando o PDF não traz CNPJ confiável ou quando o nome do condomínio no relatório diverge do cadastro oficial.
