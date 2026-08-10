import { NextResponse } from 'next/server'
import * as XLSX from 'xlsx'
import { requireAuthenticatedApiUser } from '@/app/api/_lib/auth'
import { createAdminClient } from '@/utils/supabase/admin'

export const runtime = 'nodejs'

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { user, response } = await requireAuthenticatedApiUser()
  if (response) return response
  const { id } = await params
  const supabase = createAdminClient()
  const { data, error } = await supabase.from('conversoes_relatorio').select('nome_arquivo, preview_json').eq('id', id).eq('origem', 'captacao_automatizada:bbz').maybeSingle()
  if (error || !data) return NextResponse.json({ ok: false, error: error?.message || 'Conversão não encontrada.' }, { status: 404 })
  const preview: any = data.preview_json ?? {}
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user!.id).maybeSingle()
  if (profile?.role !== 'admin') {
    const { data: acesso } = await supabase.from('usuarios_carteiras').select('carteira_id').eq('user_id', user!.id).eq('carteira_id', preview.carteiraId).maybeSingle()
    if (!acesso) return NextResponse.json({ ok: false, error: 'Você não tem acesso a esta carteira.' }, { status: 403 })
  }
  const rows = (preview.cobrancas ?? []).map((item: any) => ({
    Condomínio: preview.condominio || '', Bloco: item.bloco || '', Unidade: item.unidade || '',
    Responsável: item.responsavel || '', Recibo: item.recibo || '', Vencimento: item.vencimento || '',
    Principal: Number(item.valorPrincipal ?? 0), Multa: Number(item.multa ?? 0), Correção: Number(item.correcao ?? 0),
    Juros: Number(item.juros ?? 0), Total: Number(item.valorTotal ?? 0),
  }))
  const workbook = XLSX.utils.book_new()
  const worksheet = XLSX.utils.json_to_sheet(rows)
  worksheet['!cols'] = [{ wch: 28 }, { wch: 10 }, { wch: 14 }, { wch: 34 }, { wch: 16 }, { wch: 14 }, { wch: 14 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 14 }]
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Cobranças')
  const bytes = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' })
  const base = String(data.nome_arquivo || 'captacao').replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9_-]+/g, '_')
  return new NextResponse(bytes, { headers: {
    'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'Content-Disposition': `attachment; filename="${base}_validacao.xlsx"`,
    'Cache-Control': 'private, no-store',
  } })
}
