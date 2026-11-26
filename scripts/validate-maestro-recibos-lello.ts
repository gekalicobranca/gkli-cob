import assert from "node:assert/strict"
import { test } from "node:test"
import { carregarCadastroRecibosLello, resolverRecibosLello } from "../features/importacoes/maestro-recibos-lello"
import { conciliarCobrancaImportada } from "../features/importacoes/cobrancas-conciliacao"

const linha: Parameters<typeof resolverRecibosLello>[0][number] = { unidade: "000032", bloco: "0", recibo: "LELLO-123-000032-20241020",
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

// Dados sintéticos reproduzem os quatro padrões encontrados na investigação da Lello.
test("ignora a versão sintética arquivada ao selecionar a cota ativa de conciliação", () => {
  const ativa = { ...protegida, observacoes: "Recibo: 12345678", origem_importacao: "Conciliação Lello confirmada 28/10/2026" }
  const arquivada = { ...protegida, arquivada_em: "2026-11-12T19:21:00Z", observacoes: `Recibo ${linha.recibo}` }
  const cadastro = [arquivada, ativa]
  const antes = structuredClone(cadastro)
  assert.equal(resolverRecibosLello([linha], cadastro)[0].recibo, "12345678")
  assert.deepEqual(cadastro, antes)
  assert.equal(resolverRecibosLello([linha], [...cadastro].reverse())[0].recibo, "12345678")
})

test("ignora o histórico arquivado quando a ativa já possui recibo e alias válidos", () => {
  const arquivada = { ...protegida, arquivada_em: "2026-11-10T03:36:00Z", observacoes: "Recibo LELLO-12345678" }
  const cadastro = [protegida, arquivada]
  const resolvidas = resolverRecibosLello([linha], cadastro)
  assert.equal(resolvidas[0].recibo, "12345678")
  assert.deepEqual(resolverRecibosLello(resolvidas, cadastro), resolvidas)
})

test("reconhece recibo sem dois-pontos em conciliação antiga e preserva o estado de acordo", () => {
  const cota = { ...protegida, origem_importacao: "Conciliação Lello CO. NEXT - 12/11/2026",
    observacoes: "Conciliação de cobrança | recibo 12345678\nHistórico preservado",
    status_operacional: "acordo_firmado", status_financeiro: "renegociado",
    acordo_id: "acordo-existente", parcelas_acordo: [{ id: "parcela-existente", valor: 25 }] }
  const antes = structuredClone(cota)
  const resolvidas = resolverRecibosLello([linha], [cota])
  assert.equal(resolvidas[0].recibo, "12345678")
  assert.equal(resolvidas[0].unidadeReciboLello, protegida.unidade_id)
  assert.equal(resolvidas[0].chavePlanilhaLello, linha.recibo)
  assert.deepEqual(resolverRecibosLello(resolvidas, [cota]), resolvidas)
  assert.deepEqual(cota, antes)
})

test("reconhece Recibo: no meio das observações de importação antiga", () => {
  const cota = { ...protegida, origem_importacao: "importacao_cobrancas - 17/11/2026, 16:22",
    observacoes: "Origem: relatório Lello | Recibo: 12345678 | Histórico" }
  const resolvidas = resolverRecibosLello([linha], [cota])
  assert.equal(resolvidas[0].recibo, "12345678")
  assert.deepEqual(resolverRecibosLello(resolvidas, [cota]), resolvidas)
})

test("formatos antigos não liberam ambiguidade ativa, marcadores conflitantes ou valores diferentes", () => {
  const legada = { ...protegida, origem_importacao: "importacao_cobrancas - 17/11/2026",
    observacoes: "Histórico | Recibo: 12345678" }
  for (const cadastro of [
    [legada, { ...legada, observacoes: "Recibo: 87654321" }],
    [{ ...legada, unidade_id: "outra-unidade" }, legada],
    [{ ...legada, valor_original: 99 }],
    [{ ...legada, observacoes: "Recibo: 12345678 | recibo 87654321" }],
    [{ ...legada, observacoes: `${legada.observacoes} | Recibo LELLO-123-000033-20241020` }],
    [{ ...legada, observacoes: "Outro identificador: 12345678" }],
    [{ ...legada, observacoes: "Recibo: 12345678-9" }],
    [{ ...legada, origem_importacao: "Origem desconhecida" }],
    [{ ...legada, origem_importacao: "Espelhamento Lello 1234 - 17/11/2026" }],
  ]) assert.throws(() => resolverRecibosLello([linha], cadastro), /confira o recibo/)
  assert.throws(() => resolverRecibosLello([linha, linha], [legada]), /confira o recibo/)
})

test("resolve recibo de conversão legada sem alterar proteção judicial, pagamentos ou histórico", async () => {
  const importada: Parameters<typeof resolverRecibosLello>[0][number] = { unidade: "100032", bloco: "0", recibo: "LELLO-63004-100032-20260210",
    vencimento: "10/02/2026", valorPrincipal: 426.2 }
  const cota = { id: "cota-judicial", unidade_id: "unidade-judicial", carteira_id: "carteira", condominio_id: "safira",
    unidades: { identificacao: "100032", bloco: "0", acao_judicial: true }, competencia: "02/2026",
    vencimento: "2026-02-10", valor_original: 426.2, valor_atualizado: 493.5,
    origem_importacao: "conversao_relatorio - 15/09/2026, 21:46",
    observacoes: "Histórico preservado | Recibo: 53105613 | Recibo 53105613",
    status: "judicializado", status_operacional: "judicializado", status_financeiro: "em_aberto",
    automacao_bloqueada: true, data_pagamento: null, valor_pago: null, updated_at: "2026-11-17T19:42:53Z",
    historico: [{ evento: "judicializacao_confirmada" }] }
  const antes = structuredClone({ importada, cota })
  const [resolvida] = resolverRecibosLello([importada], [cota])
  assert.equal(resolvida.recibo, "53105613")
  assert.equal(resolvida.chavePlanilhaLello, importada.recibo)
  assert.equal(resolvida.unidadeReciboLello, cota.unidade_id)
  assert.deepEqual(resolverRecibosLello([resolvida], [cota]), [resolvida])
  const db = { from(tabela: string) {
    assert.equal(tabela, "cobrancas")
    const query = { select() { return query }, is() { return query }, eq() { return query } }
    return query
  } }
  const resultado = await conciliarCobrancaImportada(db, {
    unidade_id: cota.unidade_id, carteira_id: cota.carteira_id, condominio_id: cota.condominio_id,
    recibo: resolvida.recibo, vencimento: cota.vencimento, valor_original: resolvida.valorPrincipal,
    valor_atualizado: 493.5,
  }, true, new Map([[cota.unidade_id, [cota]]]))
  assert.equal(resultado.status, "atualizar")
  assert.equal(resultado.cobrancaId, cota.id)
  assert.deepEqual({ importada, cota }, antes)
})

test("conversão legada continua exigindo recibo único, principal e alias sem conflito", () => {
  const cota = { ...protegida, origem_importacao: "conversao_relatorio - 15/09/2026, 21:46",
    observacoes: "Origem Lello | Recibo: 12345678" }
  for (const cadastro of [
    [cota, { ...cota, observacoes: "Recibo: 87654321" }],
    [{ ...cota, valor_original: 99.99 }],
    [{ ...cota, observacoes: "Recibo: 12345678 | Recibo: 87654321" }],
    [{ ...cota, observacoes: `${cota.observacoes} | Recibo LELLO-123-000033-20241020` }],
    [{ ...cota, origem_importacao: "conversao_relatorio_outro - 15/09/2026" }],
  ]) assert.throws(() => resolverRecibosLello([linha], cadastro), /confira o recibo/)
})

test("carregamento seleciona somente cobranças não arquivadas dentro da carteira e condomínio", async () => {
  const filtros = new Map<string, unknown>()
  const retornada = { ...protegida, arquivada_em: null }
  const arquivada = { ...protegida, arquivada_em: "2026-11-10T00:00:00Z" }
  let consultas = 0
  const db = { from(tabela: string) {
    assert.equal(tabela, "cobrancas")
    consultas++
    const query = {
      select() { return query },
      eq(campo: string, valor: unknown) { filtros.set(campo, valor); return query },
      is(campo: string, valor: unknown) { filtros.set(campo, valor); return query },
      order() { return query }, range() { return query },
      async overrideTypes() {
        return { data: [retornada, arquivada].filter(cota => !filtros.has("arquivada_em") || cota.arquivada_em === filtros.get("arquivada_em")), error: null }
      },
    }
    return query
  } }
  const resultado = await carregarCadastroRecibosLello(db as unknown as Parameters<typeof carregarCadastroRecibosLello>[0], "carteira", "condominio")
  assert.deepEqual(resultado, [retornada])
  assert.equal(consultas, 1)
  assert.equal(filtros.get("carteira_id"), "carteira")
  assert.equal(filtros.get("condominio_id"), "condominio")
  assert.equal(filtros.get("unidades.condominio_id"), "condominio")
})

test("os quatro padrões seguem para atualização da cobrança existente sem reinserção ou mutação", async () => {
  const historico = { ...protegida, id: "historico", arquivada_em: "2026-11-10T00:00:00Z", observacoes: `Recibo ${linha.recibo}` }
  const casos = [
    [{ ...protegida, observacoes: "Recibo: 12345678", origem_importacao: "Conciliação Lello confirmada 28/10/2026" }, historico],
    [protegida, { ...historico, observacoes: "Recibo LELLO-12345678" }],
    [{ ...protegida, observacoes: "Conciliação | recibo 12345678\nHistórico", origem_importacao: "Conciliação Lello CO. NEXT - 12/11/2026" }],
    [{ ...protegida, observacoes: "Importação | Recibo: 12345678 | Histórico", origem_importacao: "importacao_cobrancas - 17/11/2026" }],
  ]
  for (const [indice, cadastro] of casos.entries()) {
    const cobrancas = cadastro.map((cota, i) => ({ ...cota, id: i === 0 ? "ativa" : "historico",
      carteira_id: "carteira", condominio_id: "condominio", competencia: null,
      valor_atualizado: 105, status_operacional: indice === 2 ? "acordo_firmado" : "em_cobranca_ativa",
      status_financeiro: indice === 2 ? "renegociado" : "em_aberto", updated_at: "2026-11-20T00:00:00Z" }))
    const antes = structuredClone(cobrancas)
    const [resolvida] = resolverRecibosLello([linha], cobrancas)
    const db = { from(tabela: string) {
      assert.equal(tabela, "cobrancas")
      const query = { select() { return query }, is() { return query }, eq() { return query } }
      return query
    } }
    const resultado = await conciliarCobrancaImportada(db, {
      unidade_id: resolvida.unidadeReciboLello!, carteira_id: "carteira", condominio_id: "condominio",
      recibo: resolvida.recibo, vencimento: "2024-10-20", valor_original: resolvida.valorPrincipal,
      valor_atualizado: 110,
    }, true, new Map([[protegida.unidade_id, cobrancas]]))
    assert.equal(resultado.status, "atualizar")
    assert.equal(resultado.cobrancaId, "ativa")
    assert.deepEqual(cobrancas, antes)
  }
})
