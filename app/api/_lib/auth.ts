import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'

export async function requireAuthenticatedApiUser() {
  const supabase = await createClient()
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()

  if (error || !user) {
    return {
      user: null,
      response: NextResponse.json(
        { ok: false, error: 'Usuário não autenticado.' },
        { status: 401 },
      ),
    }
  }

  return { user, response: null }
}

export function requireCronSecret(request: Request) {
  const secret = process.env.REGUA_CRON_SECRET

  if (!secret) {
    return NextResponse.json(
      { ok: false, error: 'REGUA_CRON_SECRET não configurado no ambiente.' },
      { status: 500 },
    )
  }

  const auth = request.headers.get('authorization')

  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json(
      { ok: false, error: 'Não autorizado.' },
      { status: 401 },
    )
  }

  return null
}
