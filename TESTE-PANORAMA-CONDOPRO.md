# Teste do parser Panorama Vila Romana / CondoPro

Arquivo testado: `Cond. Panorama.pdf`

Resultado esperado/validado:

- Padrão detectado: `Condopro / BBZ · Cobranças`
- Condomínio detectado: `PANORAMA VILA ROMANA`
- Confiança: `90%`
- Cobranças geradas: `7`
- Valor total atualizado: `R$ 20.047,40`
- Total bate com o rodapé do PDF

Regras aplicadas:

- 1 cobrança por `Total do Recibo`
- Valor original/principal = total principal do recibo
- Valor atualizado = total corrigido do recibo
- Marcadores `A` e `AE` preservados em `marcadorOrigem`/`situacaoOrigem`
- Unidade e responsável capturados pelo cabeçalho `Bloco: ... Unidade: ...`
