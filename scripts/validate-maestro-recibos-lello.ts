import assert from "node:assert/strict"
import { test } from "node:test"
import { resolverRecibosLello } from "../features/importacoes/maestro-recibos-lello"

const linha = { unidade: "000032", bloco: "0", recibo: "LELLO-123-000032-20241020",
  vencimento: "20/10/2024", valorPrincipal: 100 }
const protegida = { unidade_id: "unidade-32", unidades: { identificacao: "32", bloco: "0" },
  vencimento: "2024-10-20", valor_original: 100, origem_importacao: "Conversão",
  observacoes: `Recibo: 12345678\nConversão de relatório - recibo ${linha.recibo}` }
const extra = { ...linha, valorPrincipal: 43.21 }
const portal = { ...protegida, valor_original: 43.21, observacoes: "Recibo: 87654321",
  origem_importacao: "Espelhamento Lello 123 - 12/11/2026" }

test("concilia a cota e o lançamento extra no mesmo dia e conserva os vínculos ao repetir", () => {
  for (const obs of [protegida.observacoes, `Recibo: 12345678\nRecibo ${linha.recibo} | Recuperação autorizada`]) {
    const cadastro = [portal, { ...protegida, observacoes: obs }]
    const resolvidas = resolverRecibosLello([extra, linha], cadastro)
    assert.deepEqual(resolvidas.map(i => i.recibo), ["87654321", "12345678"])
    assert.deepEqual(resolverRecibosLello(resolvidas, cadastro), resolvidas)
    assert.deepEqual(resolverRecibosLello([linha, extra], cadastro.reverse()), [...resolvidas].reverse())
    assert.throws(() => resolverRecibosLello(resolvidas, []), /confira o recibo/)
  }
})
test("exige principal e origem compatíveis e vínculo único nas duas direções", () => {
  for (const cadastro of [[{ ...protegida, valor_original: 90 }], [protegida, protegida],
    [{ ...protegida, observacoes: "Recibo: 12345678", origem_importacao: "Espelhamento Lello 1234 - 12/11/2026" }],
    [{ ...protegida, observacoes: protegida.observacoes.replace("000032", "000033") }]]) {
    assert.throws(() => resolverRecibosLello([linha], cadastro), /confira o recibo/)
  }
  assert.throws(() => resolverRecibosLello([linha, linha], [protegida]), /confira o recibo/)
  assert.throws(() => resolverRecibosLello([linha, extra], []), /confira o recibo/)
  assert.deepEqual(resolverRecibosLello([linha], [{ ...protegida, unidades: { identificacao: "32", bloco: "B" } }]), [linha])
})
