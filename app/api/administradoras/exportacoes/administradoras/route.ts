import { NextResponse } from 'next/server'
import { unstable_rethrow } from 'next/navigation'
import { criarExcelAdministradoras } from '@/features/administradoras/exportacao-excel'
import { listAdministradoras, normalizeAdmFilters } from '@/features/administradoras/queries'
import type { Administradora } from '@/features/administradoras/types'
import { requireRole } from '@/utils/auth/require-role'

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
    await requireRole(['admin', 'gestor'])
    const filters = normalizeAdmFilters({
      search: getParam(url.searchParams, 'q'),
      status: getParam(url.searchParams, 'status'),
      acessoAcordo: getParam(url.searchParams, 'acesso_acordo'),
    })
    const ordenar = getParam(url.searchParams, 'ordenar') || 'nome'
    const rows = sortAdministradoras(await listAdministradoras(filters), ordenar)
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
    unstable_rethrow(error)
    const message = error instanceof Error ? error.message : 'Erro inesperado ao exportar administradoras.'
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
