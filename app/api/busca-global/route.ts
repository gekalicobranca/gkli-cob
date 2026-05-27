import { NextResponse } from 'next/server'
import { getPermittedCarteiras } from '@/utils/auth/get-permitted-carteiras'
import { globalSearch } from '@/features/base-cadastral/queries'
import { formatCurrency } from '@/utils/formatters/currency'

function normalizeText(value?: string | null) {
  return value && value.trim() ? value.trim() : '-'
}

function statusLabel(value?: string | null) {
  if (!value) return null
  return String(value).replaceAll('_', ' ')
}

function formatDate(value?: string | null) {
  if (!value) return '-'
  try {
    return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(value))
  } catch {
    return '-'
  }
}

export async function GET(request: Request) {
  const url = new URL(request.url)
  const q = String(url.searchParams.get('q') ?? '').trim().slice(0, 80)

  if (q.length < 2) {
    return NextResponse.json({ query: q, total: 0, results: [] })
  }

  const scope = await getPermittedCarteiras()
  const data = await globalSearch(scope, q)

  const condominios = data.condominios.map((row: any) => ({
    id: row.id,
    type: 'condominio' as const,
    title: row.nome_operacional || row.nome || 'Condomínio',
    subtitle: `${normalizeText(row.cnpj)} · ${normalizeText(row.administradora)} · ${normalizeText(row.carteiras?.nome)}`,
    href: `/app/condominios/${row.id}`,
    status: statusLabel(row.status),
  }))

  const unidades = data.unidades.map((row: any) => ({
    id: row.id,
    type: 'unidade' as const,
    title: `Unidade ${normalizeText(row.identificacao)}${row.bloco ? ` · Bloco ${row.bloco}` : ''}`,
    subtitle: `${normalizeText(row.condominios?.nome)} · ${normalizeText(row.responsavel_nome)} · ${normalizeText(row.telefone || row.email)}`,
    href: `/app/unidades/${row.id}`,
    status: statusLabel(row.status),
  }))

  const cobrancas = data.cobrancas.map((row: any) => ({
    id: row.id,
    type: 'cobranca' as const,
    title: `Cobrança ${normalizeText(row.competencia)}`,
    subtitle: `${normalizeText(row.condominios?.nome)} · Unidade ${normalizeText(row.unidades?.identificacao)} · ${formatCurrency(row.valor_atualizado)}`,
    href: `/app/cobrancas/${row.id}`,
    status: statusLabel(row.status_financeiro || row.status_operacional),
  }))

  const acordos = data.acordos.map((row: any) => ({
    id: row.id,
    type: 'acordo' as const,
    title: `Acordo ${formatDate(row.data_acordo)}`,
    subtitle: `${normalizeText(row.condominios?.nome)} · Unidade ${normalizeText(row.unidades?.identificacao)} · ${formatCurrency(row.valor_acordado)}`,
    href: `/app/acordos/${row.id}`,
    status: statusLabel(row.status_financeiro || row.status),
  }))

  const results = [...condominios, ...unidades, ...cobrancas, ...acordos].slice(0, 24)

  return NextResponse.json({ query: q, total: results.length, results })
}
