import { criadoNoIntervalo } from '@/lib/core/filtros-criacao'
import { operadorResponsavelId } from '@/lib/core/operador-responsavel'

export type ParcelasFilaFilters = {
  operador_id?: string
  criacao_de?: string
  criacao_ate?: string
  condominio_id?: string
  carteira_id?: string
  vencimento_de?: string
  vencimento_ate?: string
  status?: string
  tipo?: string
  ordenar?: string
  q?: string
  page?: string
}

export function normalizeText(value: unknown) {
  return String(value ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

export function dateValue(value: unknown) {
  const text = String(value ?? '').trim()
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : ''
}

export function isParcelaPaga(row: any) {
  return ['paga', 'pago', 'quitada', 'quitado', 'cancelada', 'cancelado'].includes(String(row.status ?? '').toLowerCase()) || Boolean(row.data_pagamento)
}

export function getDiasAtraso(vencimento: string | null | undefined) {
  if (!vencimento) return null
  const data = new Date(`${vencimento}T00:00:00`)
  if (Number.isNaN(data.getTime())) return null
  const hoje = new Date()
  hoje.setHours(0, 0, 0, 0)
  return Math.floor((hoje.getTime() - data.getTime()) / 86400000)
}

export function filterRows(rows: any[], filters: ParcelasFilaFilters) {
  const condominioId = String(filters.condominio_id ?? '').trim()
  const carteiraId = String(filters.carteira_id ?? '').trim()
  const vencimentoDe = dateValue(filters.vencimento_de)
  const vencimentoAte = dateValue(filters.vencimento_ate)
  const status = String(filters.status ?? '').trim()
  const tipo = String(filters.tipo ?? '').trim()
  const termo = normalizeText(filters.q)

  return rows.filter((row) => {
    if (!criadoNoIntervalo(row.created_at, filters.criacao_de, filters.criacao_ate)) return false
    const acordo = row.acordo ?? {}
    if (filters.operador_id && operadorResponsavelId(acordo) !== filters.operador_id.trim()) return false
    const condominio = acordo.condominios ?? {}
    const unidade = acordo.unidades ?? {}
    const vencimento = String(row.vencimento ?? '')

    if (condominioId && condominio.id !== condominioId) return false
    if (carteiraId && acordo.carteira_id !== carteiraId) return false
    if (vencimentoDe && vencimento < vencimentoDe) return false
    if (vencimentoAte && vencimento > vencimentoAte) return false
    if (status && row.status !== status) return false
    if (tipo && (row.tipo_parcela ?? 'parcela') !== tipo) return false

    if (termo) {
      const haystack = normalizeText([
        condominio.nome,
        unidade.identificacao,
        unidade.bloco,
        unidade.responsavel_nome,
        row.numero,
        row.status,
        acordo.carteiras?.nome,
      ].filter(Boolean).join(' '))
      if (!haystack.includes(termo)) return false
    }

    return true
  })
}

export function getComparable(row: any, field: string) {
  if (field === 'vencimento_desc' || field === 'vencimento_asc') return new Date(`${row.vencimento ?? '1900-01-01'}T00:00:00`).getTime()
  if (field === 'valor_desc' || field === 'valor_asc') return Number(row.valor ?? 0)
  if (field === 'condominio') return normalizeText(row.acordo?.condominios?.nome)
  if (field === 'unidade') return normalizeText(row.acordo?.unidades?.identificacao)
  if (field === 'responsavel') return normalizeText(row.acordo?.unidades?.responsavel_nome)
  if (field === 'status') return normalizeText(row.status)
  return new Date(`${row.vencimento ?? '1900-01-01'}T00:00:00`).getTime()
}

export function sortRows(rows: any[], ordenar: string) {
  const field = ordenar || 'vencimento_asc'
  return [...rows].sort((a, b) => {
    const av = getComparable(a, field)
    const bv = getComparable(b, field)
    if (typeof av === 'number' && typeof bv === 'number') return field.endsWith('_desc') ? bv - av : av - bv
    return String(av).localeCompare(String(bv), 'pt-BR', { numeric: true })
  })
}

export function sumRows(rows: any[]) {
  return rows.reduce((sum, row) => sum + Number(row.valor ?? 0), 0)
}
