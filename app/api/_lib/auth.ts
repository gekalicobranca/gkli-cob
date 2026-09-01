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
  const secrets = getAutomationSecrets()

  if (secrets.length === 0) {
    return NextResponse.json(
      { ok: false, error: 'Credencial da automação não configurada no ambiente.' },
      { status: 500 },
    )
  }

  const auth = request.headers.get('authorization')

  if (!secrets.some((secret) => auth === `Bearer ${secret}`)) {
    return NextResponse.json(
      { ok: false, error: 'Não autorizado.' },
      { status: 401 },
    )
  }

  return null
}

export function isCronSecretAuthorized(request: Request) {
  const auth = request.headers.get('authorization')
  return getAutomationSecrets().some((secret) => auth === `Bearer ${secret}`)
}

function getAutomationSecrets() {
  return [
    process.env.CAPTACAO_ORQUESTRADOR_SECRET,
    process.env.CRON_SECRET,
    process.env.REGUA_CRON_SECRET,
  ].filter((secret): secret is string => Boolean(secret))
}
