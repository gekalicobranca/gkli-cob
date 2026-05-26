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

## Padrão ativo: Superlógica · Unidades

Arquivos de referência:

- ÁPICE.pdf — `Relatório de Unidades - Completo`, condomínio `0650 - ÁPICE FREGUESIA RES CLUBE`, CNPJ `14.452.433/0001-92`.
- LAVANCE MORUMBI.pdf — `Relatório de Unidades - Completo`, condomínio `0932 - CONDOMINIO EDIFICIO L'AVANCE MORUMBI`, CNPJ `07.573.283/0001-00`.

### Assinaturas do layout

O reconhecimento automático considera o padrão como Superlógica quando encontra, nas primeiras páginas/texto extraído:

- `Emitido em ... - Página ...`
- `Relatório de Unidades - Completo`
- `Condomínio: <código> - <nome>`
- `CNPJ: xx.xxx.xxx/xxxx-xx`
- `Bloco: <bloco> Unidade: <unidade> - <responsável> Código do cliente: <código>`
- `Dados pessoais`
- `Telefone/e-mail do cliente`
- `Dados gerais`
- `Dados do pagador`

### Mapeamento para XLSX GKLI / Importações / Unidades

- `condominio_cnpj`: vem do condomínio selecionado na tela.
- `identificacao`: campo `Unidade` do relatório.
- `bloco`: campo `Bloco` do relatório.
- `tipo`: campo `Tipo de unidade`; fallback `Apartamento`.
- `responsavel_nome`: nome ao lado da unidade, antes de `Código do cliente`.
- `responsavel_documento`: CPF/CNPJ dos dados do pagador; fallback para dados pessoais.
- `telefone`: primeiro telefone/celular/outros encontrado em `Telefone/e-mail do cliente`.
- `email`: primeiro e-mail encontrado em `Telefone/e-mail do cliente`; fallback para `Telefone/e-mail da unidade`.
- `status`: `ativo`.
- `observacoes`: origem, sistema, código do cliente, bloco, tipo de pessoa e indicação de locatário quando houver.

### Observação operacional

ÁPICE e L'AVANCE MORUMBI não são padrões separados. Eles são condomínios diferentes usando o mesmo layout do sistema Superlógica.
