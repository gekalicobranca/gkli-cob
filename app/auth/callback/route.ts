import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/utils/supabase/server'

function safeNextPath(next: string | null) {
  if (!next || !next.startsWith('/') || next.startsWith('//')) {
    return '/app'
  }

  return next
}

function redirectTo(request: NextRequest, path: string, params?: Record<string, string>) {
  const url = new URL(path, request.url)
  Object.entries(params ?? {}).forEach(([key, value]) => url.searchParams.set(key, value))
  return NextResponse.redirect(url)
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  const tokenHash = url.searchParams.get('token_hash')
  const type = url.searchParams.get('type')
  const next = safeNextPath(url.searchParams.get('next'))
  const supabase = await createClient()

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code)

    if (error) {
      return redirectTo(request, '/redefinir-senha', {
        erro: 'Link inválido ou expirado. Solicite uma nova recuperação de senha.',
      })
    }

    return redirectTo(request, next)
  }

  if (tokenHash && type === 'recovery') {
    const { error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type,
    })

    if (error) {
      return redirectTo(request, '/redefinir-senha', {
        erro: 'Link inválido ou expirado. Solicite uma nova recuperação de senha.',
      })
    }

    return redirectTo(request, next)
  }

  return redirectTo(request, '/redefinir-senha', {
    erro: 'Link inválido ou expirado. Solicite uma nova recuperação de senha.',
  })
}
