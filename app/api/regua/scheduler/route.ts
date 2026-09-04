import { NextResponse } from 'next/server'
import { requireCronSecret } from '@/app/api/_lib/auth'
import { executarSchedulerReguas } from '@/features/regua/services/scheduler'

export async function POST(req: Request) {
  const unauthorized = requireCronSecret(req)
  if (unauthorized) return unauthorized

  try {
    const url = new URL(req.url)
    const tipo = url.searchParams.get('tipo')
    const dryRun = url.searchParams.get('dryRun') === '1'
    const resultado = await executarSchedulerReguas({
      origem: 'cron',
      executarCobranca: tipo ? tipo === 'cobranca' : true,
      executarAcordos: tipo ? tipo === 'acordo' : true,
      executarPreJuridico: tipo === 'pre_juridico',
      executarWhatsapp: tipo ? tipo === 'whatsapp' : true,
      dryRun,
    })
    return NextResponse.json(resultado)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro inesperado ao executar scheduler de réguas.'
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}

export async function GET(req: Request) {
  return POST(req)
}
