import { NextResponse } from 'next/server'
import { checkAcordosStatus } from '@/features/acordos/status-service'
import { requireCronSecret } from '@/app/api/_lib/auth'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const unauthorized = requireCronSecret(request)
  if (unauthorized) return unauthorized

  try {
    const result = await checkAcordosStatus({
      diasParaRomper: 7,
    })

    return NextResponse.json(result)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro desconhecido'

    return NextResponse.json(
      {
        ok: false,
        error: message,
      },
      {
        status: 500,
      }
    )
  }
}

export async function POST(request: Request) {
  return GET(request)
}
