import { NextResponse } from 'next/server'
import { requireCronSecret } from '@/app/api/_lib/auth'
import { createAdminClient } from '@/utils/supabase/admin'
import { processarMontagemMaestro } from '@/features/flows/cobranca/maestro-montagem'

export const runtime = 'nodejs'

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const unauthorized = requireCronSecret(request)
  if (unauthorized) return unauthorized
  const { id } = await params
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ ok: false, error: 'Execução inválida.' }, { status: 400 })
  try {
    const db = createAdminClient()
    const { data: execucao, error } = await db.from('agente_execucoes').select('origem,agendado_para,condominio_id,carteira_id,easy_maestro_lote_id,easy_maestro_montar_flow').eq('id', id).single()
    if (error || !execucao || execucao.origem !== 'maestro' || execucao.agendado_para) return NextResponse.json({ ok: false, error: 'Execução não é um disparo manual do Maestro.' }, { status: 403 })
    if (execucao.easy_maestro_lote_id && !execucao.easy_maestro_montar_flow) return NextResponse.json({ ok: true, montagem: { status: 'concluido', flow_ids: [] } })
    const { data: montagem, error: consultaError } = await db.from('maestro_flow_montagens')
      .select('id,status,erro,condominio_id,carteira_id,flow_ids,parte').eq('execucao_id', id).maybeSingle()
    if (consultaError) throw consultaError
    if (!montagem) {
      // Workers anteriores ainda consultam esta rota mesmo quando a conclusão
      // dispensou montagem porque o relatório só continha recibos excluídos.
      const { data: arquivo, error: arquivoError } = await db.from('agente_arquivos').select('id')
        .eq('execucao_id', id).order('created_at', { ascending: false }).limit(1).maybeSingle()
      if (arquivoError) throw arquivoError
      if (arquivo) {
        const { data: conversao, error: conversaoError } = await db.from('conversoes_relatorio').select('status,preview_json')
          .eq('id', arquivo.id).eq('condominio_id', execucao.condominio_id).eq('carteira_id', execucao.carteira_id).maybeSingle()
        if (conversaoError) throw conversaoError
        const preview = conversao?.preview_json as any
        if (['concluido','concluido_com_alertas'].includes(conversao?.status ?? '')
          && Array.isArray(preview?.cobrancas) && preview.cobrancas.length === 0
          && preview?.exclusaoCessaoEspaco?.recibos?.length > 0) {
          return NextResponse.json({ ok: true, montagem: { status: 'concluido', flow_ids: [], semCotasElegiveis: true } })
        }
      }
    }
    if (!montagem || montagem.condominio_id !== execucao.condominio_id || montagem.carteira_id !== execucao.carteira_id) throw new Error('Montagem não encontrada para esta execução.')
    if (!['concluido', 'atencao'].includes(montagem.status)) await processarMontagemMaestro(id)
    const { data: atual, error: atualError } = await db.from('maestro_flow_montagens').select('status,erro,flow_ids,parte').eq('id', montagem.id).single()
    if (atualError || !atual) throw new Error('Não foi possível consultar a montagem.')
    return NextResponse.json({ ok: true, montagem: atual })
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : 'Não foi possível montar o flow.' }, { status: 500 })
  }
}
