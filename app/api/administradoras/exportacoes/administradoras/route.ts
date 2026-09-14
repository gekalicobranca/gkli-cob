import { NextResponse } from 'next/server'
import { criarExcelAdministradoras } from '@/features/administradoras/exportacao-excel'
import { listAdministradoras, normalizeAdmFilters } from '@/features/administradoras/queries'
import type { Administradora } from '@/features/administradoras/types'
import { getPermittedCarteiras } from '@/utils/auth/get-permitted-carteiras'

function getParam(searchParams: URLSearchParams, key: string) {
  return String(searchParams.get(key) ?? '').trim()
}

function sanitizeFileName(value: string) {
  return String(value || 'administradoras')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()
    .slice(0, 80) || 'administradoras'
}

function normalizeText(value: unknown) {
  return String(value ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

function filterAdministradoras(rows: Administradora[], acessoAcordo: string) {
  if (!acessoAcordo) return rows
  return rows.filter((row) => (acessoAcordo === 'sim' ? row.acesso_gerar_acordo : !row.acesso_gerar_acordo))
}

function sortAdministradoras(rows: Administradora[], ordenar: string) {
  const field = ordenar || 'nome'
  return [...rows].sort((a, b) => {
    const getValue = (row: Administradora) => {
      if (field === 'status') return normalizeText(row.status)
      if (field === 'acesso_acordo') return row.acesso_gerar_acordo ? '0' : '1'
      if (field === 'contato') return normalizeText(row.email ?? row.telefone)
      return normalizeText(row.nome_operacional || row.nome)
    }

    return getValue(a).localeCompare(getValue(b), 'pt-BR', { numeric: true })
  })
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url)
    await getPermittedCarteiras()
    const filters = normalizeAdmFilters({
      search: getParam(url.searchParams, 'q'),
      status: getParam(url.searchParams, 'status'),
    })
    const acessoAcordo = getParam(url.searchParams, 'acesso_acordo')
    const ordenar = getParam(url.searchParams, 'ordenar') || 'nome'
    const rows = sortAdministradoras(filterAdministradoras(await listAdministradoras(filters), acessoAcordo), ordenar)
    const buffer = await criarExcelAdministradoras(rows)
    const statusLabel = filters.status || 'todos'
    const fileName = `gkli-administradoras-${sanitizeFileName(statusLabel)}.xlsx`

    return new Response(buffer, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${fileName}"`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro inesperado ao exportar administradoras.'
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
