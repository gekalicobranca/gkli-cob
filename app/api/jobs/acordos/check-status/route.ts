import { NextResponse } from 'next/server'
import { checkAcordosStatus } from '@/features/acordos/status-service'

export async function GET() {
  try {
    const result = await checkAcordosStatus({
      diasParaRomper: 15,
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

export async function POST() {
  return GET()
}
