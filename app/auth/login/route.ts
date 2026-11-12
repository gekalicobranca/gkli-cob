import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { acessoTemporariamenteBloqueado, CAMINHO_AVISO_ACESSO } from '@/utils/auth/janela-acesso'
import { loadTrustedProfile, ProfileAuthorizationError } from '@/utils/auth/trusted-profile'

function getRedirectUrl(request: NextRequest, path: string) {
  return new URL(path, request.url)
}

export async function POST(request: NextRequest) {
  const formData = await request.formData()
  const email = String(formData.get('email') ?? '').trim()
  const password = String(formData.get('password') ?? '')

  if (!email || !password) {
    const url = getRedirectUrl(request, '/login')
    url.searchParams.set('erro', 'Informe e-mail e senha para entrar.')
    return NextResponse.redirect(url, { status: 303 })
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithPassword({ email, password })

  if (error) {
    if (acessoTemporariamenteBloqueado()) {
      return NextResponse.redirect(getRedirectUrl(request, CAMINHO_AVISO_ACESSO), { status: 303 })
    }
    const url = getRedirectUrl(request, '/login')
    url.searchParams.set('erro', 'E-mail ou senha inválidos.')
    return NextResponse.redirect(url, { status: 303 })
  }

  const {
    data: { user },
  } = await supabase.auth.getUser()

  try {
    if (!user) throw new ProfileAuthorizationError(403, 'session_missing')
    const profile = await loadTrustedProfile(supabase, user.id)
    return NextResponse.redirect(getRedirectUrl(request, profile.role === 'sindico' ? '/sindico' : '/app'), { status: 303 })
  } catch (error) {
    if (!(error instanceof ProfileAuthorizationError)) throw error
    if (error.code === 'janela_acesso') {
      await supabase.auth.signOut({ scope: 'local' })
      return NextResponse.redirect(getRedirectUrl(request, CAMINHO_AVISO_ACESSO), { status: 303 })
    }
    await supabase.auth.signOut()
    const url = getRedirectUrl(request, '/login')
    url.searchParams.set('erro', error.message)
    return NextResponse.redirect(url, { status: 303 })
  }
}
