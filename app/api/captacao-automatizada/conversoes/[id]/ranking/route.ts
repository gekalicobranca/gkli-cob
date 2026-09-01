import { NextResponse } from 'next/server'
import { requireAuthenticatedApiUser } from '@/app/api/_lib/auth'
import { createAdminClient } from '@/utils/supabase/admin'

export const runtime = 'nodejs'

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { user, response } = await requireAuthenticatedApiUser()
  if (response) return response
  const { id } = await params
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('conversoes_relatorio')
    .select('nome_arquivo, origem, preview_json')
    .eq('id', id)
    .like('origem', 'captacao_automatizada:%')
    .maybeSingle()
  if (error || !data) return NextResponse.json({ ok: false, error: error?.message || 'Conversão não encontrada.' }, { status: 404 })
  const preview: any = data.preview_json ?? {}
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user!.id).maybeSingle()
  if (profile?.role !== 'admin') {
    const { data: acesso } = await supabase.from('usuarios_carteiras').select('carteira_id').eq('user_id', user!.id).eq('carteira_id', preview.carteiraId).maybeSingle()
    if (!acesso) return NextResponse.json({ ok: false, error: 'Você não tem acesso a esta carteira.' }, { status: 403 })
  }

  const ranking = preview.rankingMensal
  if (!ranking?.xlsxBase64) {
    return NextResponse.json({ ok: false, error: 'Ranking mensal ainda não foi gerado para esta conversão.' }, { status: 404 })
  }

  const bytes = Buffer.from(String(ranking.xlsxBase64), 'base64')
  const base = String(data.nome_arquivo || 'captacao')
    .replace(/\.[^.]+$/, '')
    .replace(/[^a-zA-Z0-9_-]+/g, '_')
  return new NextResponse(bytes, { headers: {
    'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'Content-Disposition': `attachment; filename="${base}_ranking_mensal.xlsx"`,
    'Cache-Control': 'private, no-store',
  } })
}
