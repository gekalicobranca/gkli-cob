# BRCondos — Lista de Moradores

- Padrão: `brcondos-lista-moradores-responsaveis-v1`.
- Categoria interna: `unidades`; destino: Importações/Responsáveis.
- Reconhecimento pelo conteúdo: título `moradores`, seção `UNIDADE`, campos `Número`, `Proprietário` ou `Morador/Locatário`, endereço/complemento, celular e e-mail. O logotipo é uma imagem; o nome do arquivo e do condomínio não determinam o padrão.
- Condomínio detectado: linha anterior ao CNPJ do cabeçalho. O CNPJ exportado continua sendo o do condomínio selecionado no fluxo.
- Cada cadastro gera uma linha, preservando zeros à esquerda e responsáveis diferentes da mesma unidade. Proprietário vira `proprietario`; Morador/Locatário vira `inquilino`, mantendo o rótulo original nas observações.
- Telefones e e-mails são preservados com separador ` | `; telefones compostos só de zeros são descartados. Contatos que continuam na página seguinte permanecem no cadastro de origem.
- O relatório não informa CPF/CNPJ pessoal, bloco ou tipo de imóvel. Documento e bloco ficam vazios; tipo recebe `unidade`. A prévia alerta sobre a ausência de documentos pessoais.
- Saídas: CSV e XLSX oficiais de responsáveis, com status `ativo`.

Validação automatizada com dados fictícios:

```powershell
npx tsx scripts/validate-conversao-brcondos.ts
```

Opcionalmente passe o caminho local do PDF de referência Vila Bella Vista como primeiro argumento. A conferência espera 30 responsáveis em 27 unidades (27 proprietários e 3 moradores/locatários), incluindo os cadastros que cruzam páginas. O PDF e seus dados pessoais não são incorporados ao repositório.
