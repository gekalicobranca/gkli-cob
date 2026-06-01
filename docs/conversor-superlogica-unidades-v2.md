# Conversor Superlógica · Unidades v2

## Objetivo

Converter PDFs do **Superlógica · Relatório de Unidades - Completo** para o XLSX oficial do GKLI Cobrança em **Importações > Unidades**.

A saída segue exatamente a aba `DADOS` do template oficial:

```txt
condominio_cnpj
identificacao
bloco
tipo
responsavel_nome
responsavel_documento
telefone
email
status
observacoes
```

## Regra principal

O conversor **não importa diretamente** no banco.

Fluxo correto:

1. PDF Superlógica
2. Validação da qualidade do texto
3. Parser Superlógica
4. Prévia operacional
5. Download XLSX GKLI
6. Importação pelo módulo oficial de Unidades

## PDFs ruins

PDFs com texto corrompido, encoding quebrado ou baixa qualidade de extração são descartados.

Não usamos OCR nesta etapa.

Motivo: OCR em relatório longo aumenta muito o risco de unidade, CPF/CNPJ, telefone ou e-mail incorretos.

## Campos extraídos

| Campo GKLI | Origem Superlógica |
|---|---|
| `condominio_cnpj` | Condomínio selecionado no app |
| `identificacao` | `Unidade:` |
| `bloco` | `Bloco:` |
| `tipo` | `Tipo de unidade:` |
| `responsavel_nome` | nome após `Unidade: xxxx - ...` |
| `responsavel_documento` | CPF/CNPJ em `Dados do pagador` ou `Dados pessoais` |
| `telefone` | primeiro telefone/celular válido do cliente ou unidade |
| `email` | primeiro e-mail válido do cliente ou unidade |
| `status` | fixo: `ativo` |
| `observacoes` | origem, sistema, código cliente, bloco, tipo pessoa, sinais relevantes |

## Validações de prévia

A prévia mostra atenções quando houver:

- unidade duplicada
- identificação vazia
- responsável não identificado
- CPF/CNPJ não localizado
- ausência simultânea de telefone e e-mail

Essas atenções não impedem o download do XLSX; a validação final continua no importador oficial.

## Padrões testados conceitualmente

Foram analisados relatórios Superlógica com variações de:

- bloco `0`, bloco numérico e bloco alfanumérico
- unidade numérica e unidade especial, como `GR`
- responsável pessoa física e jurídica
- múltiplos e-mails
- múltiplos telefones
- dados de unidade e dados de cliente
- relatórios com texto legível
- PDF com encoding corrompido, que deve ser recusado
