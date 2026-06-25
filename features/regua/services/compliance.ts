import { createAdminClient } from '@/utils/supabase/admin'

type Canal = 'whatsapp' | 'email' | 'manual' | string

export type ReguaComplianceContext = {
  carteiraId?: string | null
  condominioId?: string | null
  unidadeId?: string | null
  cobrancaId?: string | null
  acordoId?: string | null
  destinatario?: string | null
  canal?: Canal
  agora?: Date
}

export type ReguaComplianceResult = {
  permitido: boolean
  motivo?: string
  regra?: string
  payload?: Record<string, unknown>
}

const DEFAULT_WINDOW_START = '08:00'
const DEFAULT_WINDOW_END = '20:00'
const DEFAULT_DAILY_LIMIT_PER_DESTINATARIO = 3
const DEFAULT_MIN_INTERVAL_MINUTES = 120

function minutesOfDay(value: string | null | undefined, fallback: string) {
  const [h, m] = String(value || fallback).split(':').map(Number)
  return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0)
}

function sameDayIso(date = new Date()) {
  return date.toISOString().slice(0, 10)
}

async function carregarRegras(supabase: ReturnType<typeof createAdminClient>, carteiraId?: string | null) {
  const { data, error } = await supabase
    .from('regua_compliance_regras')
    .select('id, carteira_id, canal, ativo, janela_inicio, janela_fim, limite_diario_destinatario, intervalo_minimo_minutos, permitir_finais_semana')
    .eq('ativo', true)
    .or(`carteira_id.is.null${carteiraId ? `,carteira_id.eq.${carteiraId}` : ''}`)
    .order('carteira_id', { ascending: true, nullsFirst: true })
    .limit(20)

  if (error) {
    if (error.code === '42P01' || error.code === '42703') return null
    throw new Error(`Erro ao carregar regras de compliance: ${error.message}`)
  }

  return data ?? []
}

async function destinatarioBloqueado(supabase: ReturnType<typeof createAdminClient>, destinatario?: string | null, canal?: Canal) {
  if (!destinatario) return null
  const { data, error } = await supabase
    .from('regua_destinatarios_bloqueados')
    .select('id, motivo')
    .eq('destinatario', destinatario)
    .in('canal', [canal ?? 'whatsapp', 'todos'])
    .eq('ativo', true)
    .maybeSingle()

  if (error) {
    if (error.code === '42P01' || error.code === '42703') return null
    throw new Error(`Erro ao verificar bloqueio do destinatário: ${error.message}`)
  }
  return data as any
}

function applyEscopoMesmoDebito(query: any, ctx: ReguaComplianceContext) {
  let scoped = query

  scoped = ctx.condominioId ? scoped.eq('condominio_id', ctx.condominioId) : scoped.is('condominio_id', null)
  scoped = ctx.unidadeId ? scoped.eq('unidade_id', ctx.unidadeId) : scoped.is('unidade_id', null)

  return scoped
}

export async function avaliarComplianceRegua(ctx: ReguaComplianceContext): Promise<ReguaComplianceResult> {
  const canal = ctx.canal ?? 'whatsapp'
  if (canal === 'manual') return { permitido: true, regra: 'canal_manual' }

  const supabase = createAdminClient()
  const bloqueio = await destinatarioBloqueado(supabase, ctx.destinatario, canal)
  if (bloqueio?.id) {
    return { permitido: false, motivo: bloqueio.motivo || 'Destinatário bloqueado para este canal.', regra: 'blacklist' }
  }

  const regras = await carregarRegras(supabase, ctx.carteiraId)
  const regra = (regras ?? []).find((row: any) => !row.canal || row.canal === canal) as any
  const agora = ctx.agora ?? new Date()
  const atualMin = agora.getHours() * 60 + agora.getMinutes()
  const inicio = minutesOfDay(regra?.janela_inicio, DEFAULT_WINDOW_START)
  const fim = minutesOfDay(regra?.janela_fim, DEFAULT_WINDOW_END)
  const weekend = agora.getDay() === 0 || agora.getDay() === 6

  if (weekend && regra?.permitir_finais_semana === false) {
    return { permitido: false, motivo: 'Compliance: finais de semana bloqueados para automação.', regra: 'fim_de_semana' }
  }

  if (atualMin < inicio || atualMin > fim) {
    return { permitido: false, motivo: `Compliance: fora da janela permitida (${regra?.janela_inicio ?? DEFAULT_WINDOW_START} às ${regra?.janela_fim ?? DEFAULT_WINDOW_END}).`, regra: 'janela_horario' }
  }

  if (ctx.destinatario) {
    const desde = new Date(agora)
    desde.setMinutes(desde.getMinutes() - Number(regra?.intervalo_minimo_minutos ?? DEFAULT_MIN_INTERVAL_MINUTES))

    // Ballpark: depois evoluir para agrupamento por contato quando o mesmo
    // destinatario tiver unidades/condominios diferentes no mesmo ciclo.
    const intervaloQuery = supabase
      .from('mensagens')
      .select('id', { count: 'exact', head: true })
      .eq('destinatario', ctx.destinatario)
      .eq('canal', canal)
      .gte('created_at', desde.toISOString())
    const { count: intervaloCount, error: intervaloError } = await applyEscopoMesmoDebito(intervaloQuery, ctx)

    if (intervaloError && intervaloError.code !== '42P01') throw new Error(`Erro ao validar intervalo mínimo: ${intervaloError.message}`)
    if ((intervaloCount ?? 0) > 0) {
      return { permitido: false, motivo: 'Compliance: intervalo mínimo entre contatos ainda não foi cumprido.', regra: 'intervalo_minimo' }
    }

    const diarioQuery = supabase
      .from('mensagens')
      .select('id', { count: 'exact', head: true })
      .eq('destinatario', ctx.destinatario)
      .eq('canal', canal)
      .gte('created_at', `${sameDayIso(agora)}T00:00:00.000Z`)
    const { count: diarioCount, error: diarioError } = await applyEscopoMesmoDebito(diarioQuery, ctx)

    if (diarioError && diarioError.code !== '42P01') throw new Error(`Erro ao validar limite diário: ${diarioError.message}`)
    if ((diarioCount ?? 0) >= Number(regra?.limite_diario_destinatario ?? DEFAULT_DAILY_LIMIT_PER_DESTINATARIO)) {
      return { permitido: false, motivo: 'Compliance: limite diário de contatos atingido para este destinatário.', regra: 'limite_diario' }
    }
  }

  return {
    permitido: true,
    regra: regra?.id ?? 'default',
    payload: {
      janela_inicio: regra?.janela_inicio ?? DEFAULT_WINDOW_START,
      janela_fim: regra?.janela_fim ?? DEFAULT_WINDOW_END,
      limite_diario_destinatario: regra?.limite_diario_destinatario ?? DEFAULT_DAILY_LIMIT_PER_DESTINATARIO,
      intervalo_minimo_minutos: regra?.intervalo_minimo_minutos ?? DEFAULT_MIN_INTERVAL_MINUTES,
    },
  }
}
