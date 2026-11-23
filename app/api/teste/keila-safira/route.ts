import { requireAuthenticatedApiUser } from '@/app/api/_lib/auth'
import { observarKeila } from '@/features/keila/observacao'
import { getPermittedCarteiras } from '@/utils/auth/get-permitted-carteiras'
import { createAdminClient } from '@/utils/supabase/admin'

export const runtime = 'nodejs'
export const maxDuration = 60

const safira = '2b1aa7ca-91d6-44fc-b667-8fb9bfeffb53'
const gekali = 'e1f6e3ac-1098-4b30-9e0f-af4c47b351a3'
const headers = { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' }

async function verificarAcesso() {
  if (process.env.VERCEL_ENV !== 'preview') {
    return Response.json({ erro: 'Teste disponível somente em Preview.' }, { status: 404, headers })
  }
  const acesso = await requireAuthenticatedApiUser()
  if (acesso.response) return acesso.response
  if (!['admin', 'gestor', 'operador'].includes(acesso.profile.role)) {
    return Response.json({ erro: 'Perfil sem acesso ao teste.' }, { status: 403, headers })
  }
  const { carteiraIds } = await getPermittedCarteiras()
  if (carteiraIds !== null && !carteiraIds.includes(gekali)) {
    return Response.json({ erro: 'Sem acesso à carteira GEKALI.' }, { status: 403, headers })
  }
}

export async function GET() {
  const bloqueio = await verificarAcesso()
  if (bloqueio) return bloqueio
  return new Response(`<!doctype html>
<html lang="pt-BR">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Teste de observação da Keila</title>
<main>
<h1>Teste de observação da Keila no Safira</h1>
<form method="post">
<label>Data do e-mail <input name="data" type="date" required></label>
<p><label>Trecho já lido, sem dados pessoais<br><textarea name="texto" maxlength="6000" cols="65" rows="10" required></textarea></label></p>
<button>Executar observação</button>
</form>
</main>
</html>`, { headers: { ...headers, 'Content-Type': 'text/html; charset=utf-8' } })
}

export async function POST(request: Request) {
  const bloqueio = await verificarAcesso()
  if (bloqueio) return bloqueio
  if (request.headers.get('origin') !== new URL(request.url).origin) {
    return Response.json({ erro: 'Origem da solicitação inválida.' }, { status: 403, headers })
  }
  const form = await request.formData()
  const data = form.get('data')
  const trecho = form.get('texto')
  if (typeof data !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(data)
      || typeof trecho !== 'string' || trecho.trim().length === 0 || trecho.length > 6000) {
    return Response.json({ erro: 'Informe a data e um trecho válido de até 6.000 caracteres.' }, { status: 400, headers })
  }

  const { data: cadastro, error } = await createAdminClient().from('condominios')
    .select('parcelas_acordo_sem_aprovacao_sindico, despesas_acordo_avista_percentual, despesas_acordo_parcelado_percentual, dias_apos_vencimento_regua, inicio_cobranca_dias')
    .eq('id', safira).eq('carteira_id', gekali).maybeSingle()
  if (error || !cadastro) {
    return Response.json({ erro: 'Cadastro do Safira indisponível neste ambiente.' }, { status: 503, headers })
  }
  const { parcelas_acordo_sem_aprovacao_sindico: parcelas, despesas_acordo_avista_percentual: avista,
    despesas_acordo_parcelado_percentual: parcelado } = cadastro
  const regua = cadastro.dias_apos_vencimento_regua ?? cadastro.inicio_cobranca_dias
  if (parcelas == null || avista == null || parcelado == null || regua == null) {
    return Response.json({ erro: 'O cadastro do Safira tem condições incompletas para a observação.' }, { status: 422, headers })
  }

  try {
    const resultado = await observarKeila({
      referencia: 'Safira — observação em Preview, sem caso ou unidade confirmada',
      mensagens: [{ origem: 'condomino', data, texto: trecho.trim() }],
      cadastro: {
        autonomia_habilitada: false,
        unidade_confirmada: false,
        parcelas_sem_aprovacao: parcelas,
        despesas_avista_percentual: avista,
        despesas_parcelado_percentual: parcelado,
        inicio_regua_dias: regua,
      },
    })
    console.info('[keila-safira-preview]', { modelo: resultado.modelo, response_id: resultado.response_id })
    return Response.json(resultado, { headers })
  } catch {
    console.error('[keila-safira-preview] Observação indisponível.')
    return Response.json({ erro: 'A observação não foi concluída.' }, { status: 502, headers })
  }
}
