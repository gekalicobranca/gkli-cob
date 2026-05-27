import { createAdminClient } from '@/utils/supabase/admin'

export type ReguaScoreContext = {
  carteiraId?: string | null
  cobrancaId?: string | null
  acordoId?: string | null
  unidadeId?: string | null
  condominioId?: string | null
  valor?: number | string | null
  diasAtraso?: number | null
  canal?: string | null
  retornoManual?: string | null
  historicoRespostas?: number | null
  reincidencia?: number | null
}

function toNumber(value: unknown, fallback = 0) {
  const parsed = Number(value ?? fallback)
  return Number.isFinite(parsed) ? parsed : fallback
}

export function calcularScoreRegua(ctx: ReguaScoreContext) {
  const dias = toNumber(ctx.diasAtraso, 0)
  const valor = toNumber(ctx.valor, 0)
  const reincidencia = toNumber(ctx.reincidencia, 0)
  const respostas = toNumber(ctx.historicoRespostas, 0)

  let recuperacao = 65
  recuperacao -= Math.min(35, Math.max(0, dias - 30) * 0.35)
  recuperacao -= Math.min(15, reincidencia * 3)
  recuperacao += Math.min(12, respostas * 4)
  if (valor > 5000) recuperacao -= 4
  if (ctx.canal === 'email') recuperacao -= 2
  if (ctx.retornoManual === 'prometeu_pagar' || ctx.retornoManual === 'pediu_boleto') recuperacao += 15
  if (ctx.retornoManual === 'contestou_divida' || ctx.retornoManual === 'juridico') recuperacao -= 20

  recuperacao = Math.max(1, Math.min(99, Math.round(recuperacao)))
  const riscoQuebra = Math.max(1, Math.min(99, Math.round(100 - recuperacao + Math.min(20, reincidencia * 4))))
  const prioridade = Math.max(1, Math.min(100, Math.round((dias * 0.5) + (valor > 0 ? Math.min(30, valor / 1000) : 0) + riscoQuebra * 0.35)))

  const melhorCanal = ctx.canal === 'email' && recuperacao < 55 ? 'whatsapp' : (ctx.canal ?? 'whatsapp')
  const intensidade = recuperacao >= 70 ? 'leve' : recuperacao >= 45 ? 'medio' : 'agressivo'

  return {
    score_recuperacao: recuperacao,
    risco_quebra: riscoQuebra,
    prioridade_operacional: prioridade,
    melhor_canal: melhorCanal,
    melhor_horario: '10:00',
    intensidade_sugerida: intensidade,
    recomendacao:
      recuperacao >= 70
        ? 'Manter abordagem amigável e objetiva.'
        : recuperacao >= 45
          ? 'Priorizar contato humano se houver resposta parcial.'
          : 'Escalar para ação humana antes de intensificar automação.',
  }
}

export async function salvarScoreRegua(ctx: ReguaScoreContext) {
  const supabase = createAdminClient()
  const score = calcularScoreRegua(ctx)

  const row = {
    carteira_id: ctx.carteiraId ?? null,
    cobranca_id: ctx.cobrancaId ?? null,
    acordo_id: ctx.acordoId ?? null,
    unidade_id: ctx.unidadeId ?? null,
    condominio_id: ctx.condominioId ?? null,
    score_recuperacao: score.score_recuperacao,
    risco_quebra: score.risco_quebra,
    prioridade_operacional: score.prioridade_operacional,
    melhor_canal: score.melhor_canal,
    melhor_horario: score.melhor_horario,
    intensidade_sugerida: score.intensidade_sugerida,
    recomendacao: score.recomendacao,
    payload: { entrada: ctx, score },
    calculado_em: new Date().toISOString(),
  } as any

  if (!ctx.cobrancaId && !ctx.acordoId) return score

  if (ctx.cobrancaId) await supabase.from('regua_inteligencia_scores').delete().eq('cobranca_id', ctx.cobrancaId)
  if (ctx.acordoId) await supabase.from('regua_inteligencia_scores').delete().eq('acordo_id', ctx.acordoId)

  const { error } = await supabase.from('regua_inteligencia_scores').insert(row)

  if (error && error.code !== '42P01' && error.code !== '42703') {
    throw new Error(`Erro ao salvar score da régua: ${error.message}`)
  }

  return score
}
