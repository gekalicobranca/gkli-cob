import { createServerClient } from '@supabase/ssr'
import { type NextRequest, NextResponse } from 'next/server'
import { acessoTemporariamenteBloqueado, AVISO_ACESSO, CAMINHO_AVISO_ACESSO } from '@/utils/auth/janela-acesso'

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  })

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabasePublishableKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabasePublishableKey) {
    return response
  }

  const supabase = createServerClient(supabaseUrl, supabasePublishableKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))

        response = NextResponse.next({
          request,
        })

        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options)
        })
      },
    },
  })

  const { data: { user } } = await supabase.auth.getUser()
  const path = request.nextUrl.pathname
  const areaProtegida = path === '/app' || path.startsWith('/app/')
    || ((path === '/sindico' || path.startsWith('/sindico/')) && path !== '/sindico/login')
  const apiComSessao = path.startsWith('/api/') && Boolean(user)

  if ((areaProtegida || apiComSessao) && acessoTemporariamenteBloqueado(user?.id)) {
    const bloqueio = apiComSessao
      ? NextResponse.json({ ok: false, error: AVISO_ACESSO }, { status: 503 })
      : NextResponse.redirect(new URL(CAMINHO_AVISO_ACESSO, request.url), 303)
    response.cookies.getAll().forEach((cookie) => bloqueio.cookies.set(cookie))
    bloqueio.headers.set('Cache-Control', 'private, no-store')
    return bloqueio
  }

  return response
}
