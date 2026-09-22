import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'
import { getPermittedCarteiras } from '@/utils/auth/get-permitted-carteiras'
import { createAdminClient } from '@/utils/supabase/admin'
import { googleSettings, googleToken, GOOGLE_SMTP_SCOPE, openGoogleSecret, sealGoogleSecret } from '@/features/mensageria/google-oauth'

export async function GET(request: NextRequest) {
  const scope = await getPermittedCarteiras()
  const jar = await cookies()
  const cookie = jar.get('google-smtp-state')?.value
  jar.set('google-smtp-state', '', { path: '/api/integracoes/google-smtp', maxAge: 0 })
  const target = new URL('/app/configuracoes/integracoes', request.url)
  try {
    if (!cookie) throw new Error('Sessão de autorização expirada. Inicie novamente.')
    const state = JSON.parse(openGoogleSecret(cookie))
    if (state.expires < Date.now() || state.userId !== scope.userId || state.state !== request.nextUrl.searchParams.get('state')) throw new Error('Autorização inválida ou expirada.')
    if (!scope.isAdmin && !scope.carteiraIds?.includes(state.carteiraId)) throw new Error('Carteira não autorizada.')
    target.searchParams.set('carteira', state.carteiraId)
    const code = request.nextUrl.searchParams.get('code')
    if (!code || request.nextUrl.searchParams.has('error')) throw new Error('Autorização Google não concluída.')
    const tokens = await googleToken({ code, code_verifier: state.verifier, grant_type: 'authorization_code', redirect_uri: googleSettings().redirectUri })
    if (!tokens.refresh_token || !tokens.scope?.split(' ').includes(GOOGLE_SMTP_SCOPE)) throw new Error('Autorize o acesso ao e-mail para concluir a conexão.')
    const response = await fetch('https://openidconnect.googleapis.com/v1/userinfo', { headers: { Authorization: `Bearer ${tokens.access_token}` }, cache: 'no-store', signal: AbortSignal.timeout(15000) })
    const identity = await response.json()
    if (!response.ok || identity.email_verified !== true || String(identity.email).toLowerCase() !== state.email.toLowerCase()) throw new Error('Selecione a mesma conta de e-mail cadastrada na carteira.')
    const db = createAdminClient()
    const { data: config } = await db.from('integracoes_smtp_config').select('id,atualizado_em').eq('id', state.configId).eq('carteira_id', state.carteiraId).single()
    if (!config || config.atualizado_em !== state.version) throw new Error('O cadastro mudou durante a conexão. Inicie novamente.')
    const { error } = await db.from('integracoes_smtp_google_tokens').upsert({ config_id: config.id, email: identity.email, refresh_token_encrypted: sealGoogleSecret(tokens.refresh_token), atualizado_em: new Date().toISOString() })
    if (error) throw new Error('Não foi possível salvar a autorização Google.')
    const { error: updateError, data } = await db.from('integracoes_smtp_config').update({ auth_method: 'google_oauth', host: 'smtp.gmail.com', porta: 465, secure: true, starttls: false, senha: null, ativo: true, remetente: identity.email, atualizado_por: scope.userId, atualizado_em: new Date().toISOString() }).eq('id', config.id).eq('atualizado_em', state.version).select('id')
    if (updateError || data?.length !== 1) throw new Error('Não foi possível ativar a conta. Conecte novamente.')
    target.searchParams.set('smtp', 'saved')
    target.searchParams.set('msg', 'Conta Google conectada. Nenhum e-mail foi enviado.')
  } catch (error) {
    target.searchParams.set('smtp', 'error')
    target.searchParams.set('msg', error instanceof Error ? error.message : 'Falha ao conectar Google.')
  }
  const response = NextResponse.redirect(target)
  response.headers.set('Cache-Control', 'no-store')
  response.headers.set('Referrer-Policy', 'no-referrer')
  return response
}
