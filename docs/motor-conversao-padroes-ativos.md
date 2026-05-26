# Motor de Conversão — padrões ativos

## Ajuste desta entrega

O motor passa a separar três conceitos:

1. **Tipo de conversão**: `unidades` ou `cobrancas`.
2. **Padrão/parser ativo**: fornecedor/sistema que gerou o relatório.
3. **Condomínio operacional**: condomínio detectado no arquivo ou selecionado pelo usuário para preencher o XLSX.

## Padrão ativo incluído

### Hflex / LiveFacilities · Unidades

- `id`: `hflex-livefacilities-unidades-v1`
- Tipo: `unidades`
- Fornecedor: `Hflex`
- Sistema: `LiveFacilities`
- Relatório: `Relatório de Unidades`
- Exemplo de condomínio detectado no PDF: `Torre do Cipó`

O nome do condomínio não é usado como padrão. Ele é apenas dado operacional para conferência e enriquecimento do XLSX.

## Reconhecimento automático

O parser de unidades agora calcula uma confiança com base em sinais do relatório, como:

- `PROCESSADO EM`
- `TIPO PESSOA`
- `PROPRIETÁRIO`
- `INQUILINO`
- `TELEFONE CELULAR`
- `CPF` ou `CNPJ`
- `CIPO` ou `TORRE DO CIPÓ`
- blocos de unidade no formato do PDF Hflex/LiveFacilities

Se o padrão não for reconhecido com segurança, a API retorna erro explicando que o PDF foi lido, mas não pertence a um padrão ativo.

## UI

A tela mantém a lista lateral de padrões ativos e mostra, após o upload:

- padrão reconhecido automaticamente;
- fornecedor;
- sistema;
- relatório;
- condomínio detectado;
- confiança da detecção.
