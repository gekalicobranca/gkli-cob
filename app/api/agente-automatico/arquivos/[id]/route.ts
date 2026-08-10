import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'

type RouteContext = { params: Promise<{ id: string }> }

export async function GET(_request: NextRequest, context: RouteContext) {
  const { id } = await context.params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Usuário não autenticado.' }, { status: 401 })
  }

  // A RLS valida o acesso do usuário à carteira da execução antes do download.
  const { data: arquivo, error } = await supabase
    .from('agente_arquivos')
    .select('id, nome_arquivo, tipo_arquivo, storage_path')
    .eq('id', id)
    .single()

  if (error || !arquivo?.storage_path) {
    return NextResponse.json({ error: 'Arquivo não encontrado.' }, { status: 404 })
  }

  const admin = createAdminClient()
  const { data, error: downloadError } = await admin.storage
    .from('agente-relatorios')
    .download(arquivo.storage_path)

  if (downloadError || !data) {
    return NextResponse.json({ error: 'Não foi possível baixar o arquivo.' }, { status: 502 })
  }

  return new NextResponse(data, {
    headers: {
      'Content-Type': arquivo.tipo_arquivo || 'application/octet-stream',
      'Content-Disposition': `attachment; filename="${arquivo.nome_arquivo.replace(/["\\\r\n]/g, '_')}"`,
      'Cache-Control': 'private, no-store',
    },
  })
}
