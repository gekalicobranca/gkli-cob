# Thomaz Multi · Inadimplentes

Padrão ativo: `thomaz-multi-inadimplentes-cobrancas-v1`.

Reconhece a identificação Thomaz Multi Administradora, o título Inadimplentes,
a posição de atualização e o cabeçalho com Principal, Juros, Multa, Atualiz.,
Honorários e Total. O condomínio é extraído do cabeçalho, sem depender do nome
do condomínio usado na validação. O PDF não identifica o software emissor;
a origem é registrada como Thomaz Multi.

## Mapeamento

- Cabeçalho `000023 1 - NOME`: unidade `000023`, bloco `1`, responsável `NOME`.
- Código: recibo; uma cobrança por linha de débito.
- Vencimento: expandido para DD/MM/AAAA; competência original: MM/AAAA.
- Principal, juros, multa, atualização e honorários: mantidos separadamente no preview.
- Jurídico: marcador e situação de origem `juridico`, sem incorporar o marcador ao nome.
- Atraso e competência: preservados também nas observações.
- CSV/XLSX: colunas oficiais de Importações/Cobranças, CNPJ selecionado pelo usuário
  e recorte operacional pelo ano corrente de vencimento.

A extração usa a posição visual do texto para separar atraso, código e valores.
Mantém a unidade entre páginas e confere em centavos a composição dos encargos,
as seis colunas de cada subtotal, a quantidade de unidades e os totais gerais de
principal e valor atualizado. Relatórios incompletos, datas inválidas e recibos
duplicados são rejeitados antes da exportação.

## Validação

Referência local: `Inadimplencia.pdf`, posição de 24/09/2026, seis páginas.

- 139 recibos, 58 unidades em três blocos.
- Principal: R$ 149.718,82; atualizado: R$ 160.536,03.
- Recorte de 2026: 117 recibos, R$ 128.893,57; 22 recibos de anos anteriores
  permanecem na leitura completa para ranking, fora da importação operacional.
- Competência 04/2026 com vencimento em 13/03/2026 preservada na exportação.

Teste sintético: `npx tsx scripts/validate-conversao-thomaz.ts`.
Para conferir também o arquivo de referência, passe seu caminho como argumento.
O PDF e seus dados pessoais não são incorporados ao repositório.
