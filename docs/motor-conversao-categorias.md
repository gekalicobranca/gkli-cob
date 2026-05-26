# Motor de Conversão por Categoria

Implementação adicionada:

- `tipo_conversao = unidades | cobrancas` na API `/api/conversao-relatorio/parse`.
- Tela com seleção obrigatória do tipo antes do upload.
- Saída XLSX separada por destino:
  - Unidades: aba `DADOS` com colunas do template de importação de unidades.
  - Cobranças: aba `dados` com colunas do template de importação de cobranças.
- Conversão de PDF de unidades exige condomínio selecionado para preencher `condominio_cnpj`.

## Dependência para PDF

A leitura de PDF no servidor usa import dinâmico de `pdf-parse`.

Se o projeto ainda não tiver a dependência instalada, rode:

```bash
npm install pdf-parse
```

Depois faça novo commit/deploy.
