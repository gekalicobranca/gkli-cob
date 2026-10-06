import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!/^[\da-f-]{36}$/i.test(id)) return new NextResponse('Documento inválido.', { status: 400 })
  const db = await createClient()
  const { data: { user } } = await db.auth.getUser()
  if (!user) return new NextResponse('Entre para acessar o documento.', { status: 401 })
  // A leitura usa o usuário e a RLS da carteira antes de acessar o bucket privado.
  const { data: registro, error } = await db.from('agente_acordos_execucoes').select('storage_path,nome_pdf').eq('id', id).eq('status', 'sucesso').single()
  if (error || !registro?.storage_path) return new NextResponse('Documento não encontrado.', { status: 404 })
  const { data, error: download } = await createAdminClient().storage.from('acordos-pdfs').download(registro.storage_path)
  if (download || !data) return new NextResponse('Documento indisponível.', { status: 503 })
  const nome = String(registro.nome_pdf ?? 'acordos.pdf').replace(/[^a-zA-Z0-9._-]/g, '_')
  return new NextResponse(data, { headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="${nome}"`, 'Cache-Control': 'private, no-store' } })
}
