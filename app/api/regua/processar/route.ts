import { NextResponse } from 'next/server'
import { processarReguaCobranca } from '@/features/regua/services/processar-regua-cobranca'
import { registrarEventoOperacional } from '@/features/operacional/service'
import { requireCronSecret } from '@/app/api/_lib/auth'
import { createAdminClient } from '@/utils/supabase/admin'

export async function POST(req: Request) {
  const unauthorized = requireCronSecret(req)
  if (unauthorized) return unauthorized

  try {
    const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {}
    const conversaoId = typeof body?.conversaoId === 'string' ? body.conversaoId : undefined
    const condominioId = typeof body?.condominioId === 'string' ? body.condominioId : undefined
    const carteiraId = typeof body?.carteiraId === 'string' ? body.carteiraId : undefined
    const resultado = await processarReguaCobranca({ origem: condominioId ? 'maestro_captacao' : 'api', condominioId, carteiraId })

    if (condominioId && carteiraId) {
      const supabase = createAdminClient()
      const { data: existente } = conversaoId
        ? await supabase.from('timeline_operacional')
          .select('id')
          .eq('evento_tipo', 'regua_cobranca.processada')
          .eq('condominio_id', condominioId)
          .contains('payload', { conversao_id: conversaoId })
          .limit(1)
          .maybeSingle()
        : { data: null }

      if (!existente) {
        await registrarEventoOperacional(supabase as any, {
          carteiraId,
          entidadeTipo: 'condominio',
          entidadeId: condominioId,
          eventoCodigo: 'regua_cobranca.processada',
          titulo: 'Régua processada pelo Maestro',
          descricao: `${resultado.totalAvaliadas} cobrança(s) avaliadas; ${resultado.totalCriadas} mensagem(ns) criada(s).`,
          severidade: resultado.totalErros > 0 ? 'alerta' : 'sucesso',
          origem: 'api',
          payload: {
            origem_pipeline: 'maestro_captacao',
            conversao_id: conversaoId ?? null,
            total_avaliadas: resultado.totalAvaliadas,
            total_criadas: resultado.totalCriadas,
            total_puladas: resultado.totalPuladas,
            total_duplicadas: resultado.totalDuplicadas,
            total_erros: resultado.totalErros,
            lote_ids: resultado.loteIds,
          },
        })
      }
    }

    return NextResponse.json({ ok: true, ...resultado })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro inesperado ao processar régua.'
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}

export async function GET(req: Request) {
  return POST(req)
}
