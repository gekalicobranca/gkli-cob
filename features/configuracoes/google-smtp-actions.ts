'use server'
import { randomBytes, createHash } from 'node:crypto'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { getPermittedCarteiras } from '@/utils/auth/get-permitted-carteiras'
import { createAdminClient } from '@/utils/supabase/admin'
import { googleSettings, GOOGLE_SMTP_SCOPE, sealGoogleSecret } from '@/features/mensageria/google-oauth'

export async function conectarGoogleSmtp(form: FormData) {
  const carteiraId = String(form.get('carteira_id') || '')
  const scope = await getPermittedCarteiras()
  if (!carteiraId || (!scope.isAdmin && !scope.carteiraIds?.includes(carteiraId))) throw new Error('Carteira não autorizada.')
  let url: URL
  try {
    const settings = googleSettings()
    const { data: config, error } = await createAdminClient().from('integracoes_smtp_config')
      .select('id,usuario,atualizado_em').eq('carteira_id', carteiraId).order('atualizado_em', { ascending: false }).limit(1).single()
    if (error || !config?.usuario) throw new Error('Salve primeiro o endereço de e-mail da carteira.')
    const state = randomBytes(32).toString('base64url')
    const verifier = randomBytes(32).toString('base64url')
    const cookie = sealGoogleSecret(JSON.stringify({ state, verifier, userId: scope.userId, carteiraId, configId: config.id, email: config.usuario, version: config.atualizado_em, expires: Date.now() + 600000 }))
    ;(await cookies()).set('google-smtp-state', cookie, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/api/integracoes/google-smtp', maxAge: 600 })
    url = new URL('https://accounts.google.com/o/oauth2/v2/auth')
    url.search = new URLSearchParams({ client_id: settings.clientId, redirect_uri: settings.redirectUri, response_type: 'code', scope: `${GOOGLE_SMTP_SCOPE} openid email`, access_type: 'offline', prompt: 'consent', login_hint: config.usuario, state, code_challenge: createHash('sha256').update(verifier).digest('base64url'), code_challenge_method: 'S256' }).toString()
  } catch (error) {
    redirect(`/app/configuracoes/integracoes?carteira=${encodeURIComponent(carteiraId)}&smtp=error&msg=${encodeURIComponent(error instanceof Error ? error.message : 'Falha ao iniciar conexão Google.')}`)
  }
  redirect(url.toString())
}
