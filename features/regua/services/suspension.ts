import { createAdminClient } from '@/utils/supabase/admin'
import { registrarEventoOperacional } from '@/features/operacional/service'
import { carregarPausasRegua, pausaAbrangeContexto } from './pausa-escopo'

export type ReguaSuspensaoContext = {
  carteiraId?: string | null
  cobrancaId?: string | null
  acordoId?: string | null
  unidadeId?: string | null
  condominioId?: string | null
  motivo?: string | null
  origem?: 'manual' | 'sistema' | 'webhook' | string
  pausaAte?: string | null
  userId?: string | null
}

export async function verificarSuspensaoRegua(ctx: ReguaSuspensaoContext) {
  const supabase = createAdminClient()
  const agora = new Date()
  const pausas = await carregarPausasRegua(supabase, [ctx], agora)
  const pausa = pausas.find(item => pausaAbrangeContexto(item, ctx, agora))
  if (!pausa) return { pausada: false as const }
  return { pausada: true as const, motivo: pausa.motivo, pausa }
}

export async function criarPausaRegua(ctx: ReguaSuspensaoContext) {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('regua_pausas')
    .insert({
      carteira_id: ctx.carteiraId ?? null,
      cobranca_id: ctx.cobrancaId ?? null,
      acordo_id: ctx.acordoId ?? null,
      unidade_id: ctx.unidadeId ?? null,
      condominio_id: ctx.condominioId ?? null,
      motivo: ctx.motivo ?? 'Pausa operacional da régua.',
      origem: ctx.origem ?? 'manual',
      pausa_ate: ctx.pausaAte ?? null,
      ativo: true,
    } as any)
    .select('id')
    .single()

  if (error) throw new Error(`Erro ao pausar régua: ${error.message}`)

  const entidadeTipo = ctx.cobrancaId ? 'cobranca' : ctx.acordoId ? 'acordo' : ctx.unidadeId ? 'unidade' : 'condominio'
  const entidadeId = ctx.cobrancaId ?? ctx.acordoId ?? ctx.unidadeId ?? ctx.condominioId
  if (entidadeId) {
    await registrarEventoOperacional(supabase as any, {
      carteiraId: ctx.carteiraId ?? null,
      entidadeTipo: entidadeTipo as any,
      entidadeId,
      eventoCodigo: 'regua.pausada',
      titulo: 'Régua pausada',
      descricao: ctx.motivo ?? 'Pausa operacional da régua.',
      severidade: 'info',
      userId: ctx.userId ?? null,
      payload: { origem: ctx.origem ?? 'manual', pausa_ate: ctx.pausaAte ?? null, regua_pausa_id: (data as any)?.id },
    })
  }

  return (data as any)?.id as string
}

export async function registrarRetornoComEfeitoRegua(params: ReguaSuspensaoContext & { tipoRetorno: string }) {
  const diasPausaPorRetorno: Record<string, number> = {
    prometeu_pagar: 5,
    pediu_boleto: 2,
    quer_negociar: 3,
    sindico_analisando: 5,
    contestou_divida: 7,
    juridico: 30,
    sem_resposta: 0,
  }

  const dias = diasPausaPorRetorno[params.tipoRetorno] ?? 0
  if (dias <= 0) return null
  const pausaAte = new Date()
  pausaAte.setDate(pausaAte.getDate() + dias)
  return criarPausaRegua({ ...params, pausaAte: pausaAte.toISOString(), motivo: params.motivo ?? `Pausa automática por retorno: ${params.tipoRetorno}.`, origem: params.origem ?? 'manual' })
}
