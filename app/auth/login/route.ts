import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/utils/supabase/server'

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
    const url = getRedirectUrl(request, '/login')
    url.searchParams.set('erro', 'E-mail ou senha inválidos.')
    return NextResponse.redirect(url, { status: 303 })
  }

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .maybeSingle()

    if (profile?.role === 'sindico') {
      return NextResponse.redirect(getRedirectUrl(request, '/sindico'), { status: 303 })
    }
  }

  return NextResponse.redirect(getRedirectUrl(request, '/app'), { status: 303 })
}
