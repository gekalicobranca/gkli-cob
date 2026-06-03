# Teste manual - Cipó PDF digital

Parser incluído: **Cipó · Cobranças PDF**.

Arquivo de referência: `Cond. Cipó.pdf`.

Resultado esperado na conversão:

- Condomínio detectado: `CONDOMINIO O PARQUE - TORRE CIPO`
- Bloco: `CIPÓ`
- Unidades: `14`
- Recibos/cobranças: `120`
- Total: `R$ 225.112,30`

Regras do parser:

- Uma linha de recibo gera uma cobrança.
- Aceita linha com acordo: `recibo acordo vencimento valor`.
- Aceita linha sem acordo: `recibo vencimento valor`.
- Ignora linhas de composição/verbas.
- Normaliza unidade sem zeros à esquerda.
- Mantém o XLSX OCR Cipó como fallback.
