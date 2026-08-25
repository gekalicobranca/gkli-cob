import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/utils/supabase/server'

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function publicOrigin(request: NextRequest) {
  const configured = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_SITE_URL
  return (configured || request.nextUrl.origin).replace(/\/$/, '')
}

function redirectTo(request: NextRequest, path: string, params?: Record<string, string>) {
  const url = new URL(path, request.url)
  Object.entries(params ?? {}).forEach(([key, value]) => url.searchParams.set(key, value))
  return NextResponse.redirect(url, { status: 303 })
}

export async function POST(request: NextRequest) {
  const formData = await request.formData()
  const email = String(formData.get('email') ?? '').trim().toLowerCase()

  if (!emailRegex.test(email)) {
    return redirectTo(request, '/recuperar-senha', {
      erro: 'Informe um e-mail válido para receber o link de recuperação.',
    })
  }

  const supabase = await createClient()
  const redirectUrl = `${publicOrigin(request)}/auth/callback?next=/redefinir-senha`
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: redirectUrl,
  })

  if (error) {
    return redirectTo(request, '/recuperar-senha', {
      erro: 'Não foi possível enviar o link agora. Tente novamente em alguns instantes.',
    })
  }

  return redirectTo(request, '/recuperar-senha', { enviado: '1' })
}
