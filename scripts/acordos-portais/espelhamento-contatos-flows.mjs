import { normalizarCelular, normalizarTelefone } from '../../lib/core/telefone.ts'

const nomeNormalizado = nome => String(nome ?? '').normalize('NFD').replace(/\p{Diacritic}/gu, '').trim().replace(/\s+/g, ' ').toUpperCase()
const documento = valor => String(valor ?? '').replace(/\D/g, '')
const emailValido = valor => /^[^\s@;,]+@[^\s@;,]+\.[^\s@;,]+$/.test(valor)

export function planejarContatosEFlows({ fichas, cotas, chaveUnidade, canais, prazoDias, preJuridico }) {
  const porUnidade = new Map()
  for (const ficha of fichas) {
    const chave = chaveUnidade(ficha.unidade)
    porUnidade.set(chave, porUnidade.has(chave) ? null : ficha)
  }
  const unidades = new Map(cotas.map(c => [c.unidade.id, c.unidade]))
  const contatos = new Map()
  const revisoes = []
  for (const u of unidades.values()) {
    const ficha = porUnidade.get(chaveUnidade(u.identificacao, u.bloco))
    const doc = documento(ficha?.documento)
    const docLocal = documento(u.responsavel_documento)
    if (!ficha?.nome || (doc && docLocal ? doc !== docLocal : nomeNormalizado(ficha.nome) !== nomeNormalizado(u.responsavel_nome))) {
      revisoes.push({ unidade: u.identificacao, bloco: u.bloco, motivo: ficha ? 'Titularidade precisa de confirmação.' : 'Ficha da administradora ausente ou ambígua.' })
      continue
    }
    const email = String(ficha.email ?? '').trim().toLowerCase()
    const celulares = [...new Set(ficha.telefones.map(normalizarCelular).filter(Boolean))]
    const confirmado = { email: emailValido(email) ? email : null, whatsapp: celulares.length === 1 ? celulares[0] : null }
    contatos.set(u.id, confirmado)
    const antes = {}, depois = {}
    if (confirmado.email && confirmado.email !== String(u.email ?? '').trim().toLowerCase()) { antes.email = u.email; depois.email = confirmado.email }
    const telefoneLocal = normalizarTelefone(u.telefone)
    if (confirmado.whatsapp && (!u.telefone || telefoneLocal.numero?.length === 13) && telefoneLocal.numero !== confirmado.whatsapp) {
      antes.telefone = u.telefone; depois.telefone = confirmado.whatsapp
    }
    if (nomeNormalizado(ficha.nome) !== nomeNormalizado(u.responsavel_nome)) { antes.responsavel_nome = u.responsavel_nome; depois.responsavel_nome = ficha.nome }
    const campos = Object.keys(depois)
    if (campos.length || celulares.length > 1) revisoes.push({ unidadeId: u.id, unidade: u.identificacao, bloco: u.bloco,
      revisao: campos.length ? u.updated_at : null, antes, depois, consultadoEm: ficha.consultadoEm,
      motivo: [campos.length ? `Atualização proposta na ficha Lello (${campos.join(', ')}).` : '', celulares.length > 1 ? 'Mais de um celular para confirmar.' : ''].filter(Boolean).join(' ') })
  }

  const candidatas = []
  const porCota = new Map()
  for (const { cota } of cotas) porCota.set(cota.id, (porCota.get(cota.id) ?? 0) + 1)
  for (const { item, unidade, cota, vinculoExato, impedida, diasAtraso, baixaNaFonte } of cotas) {
    const confirmado = contatos.get(unidade.id)
    if (!confirmado || impedida || baixaNaFonte || !vinculoExato || porCota.get(cota.id) !== 1 || cota.automacao_bloqueada || cota.data_pagamento
      || !['em_aberto', 'vencido', 'parcial'].includes(cota.status_financeiro)
      || !['novo', 'em_cobranca_ativa'].includes(cota.status_operacional)
      || !(diasAtraso >= Math.max(1, prazoDias)) || (preJuridico.habilitado && diasAtraso >= preJuridico.prazoDias)) continue
    const canaisConfirmados = canais.filter(canal => confirmado[canal])
    if (canaisConfirmados.length) candidatas.push({ id: cota.id, unidadeId: unidade.id, unidade: unidade.identificacao, bloco: unidade.bloco,
      recibo: item.recibo, saldoCentavos: item.valores.at(-1), canais: canaisConfirmados,
      destinatarios: Object.fromEntries(canaisConfirmados.map(canal => [canal, confirmado[canal]])) })
  }
  return { contatosConferidos: contatos.size, revisoes, candidatas }
}
