import { createClient } from '@/utils/supabase/server'
import { applyCarteiraScope } from '@/utils/auth/apply-carteira-scope'
import type { CarteiraScope } from '@/utils/auth/get-permitted-carteiras'

async function safe<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try { return await fn() } catch { return fallback }
}

export async function getReguasR2Overview(scope: CarteiraScope) {
  const supabase = await createClient()

  const jobs = await safe(async () => {
    const { data, error } = await supabase
      .from('regua_jobs')
      .select('id, tipo, origem, status, iniciado_em, finalizado_em, erro, resumo')
      .order('iniciado_em', { ascending: false })
      .limit(8)
    if (error) throw error
    return data ?? []
  }, [] as any[])

  const pausas = await safe(async () => {
    let query: any = supabase
      .from('regua_pausas')
      .select('id, carteira_id, motivo, origem, pausa_ate, ativo, created_at, carteiras(nome)')
      .eq('ativo', true)
      .order('created_at', { ascending: false })
      .limit(8)
    query = applyCarteiraScope(query, scope.carteiraIds)
    const { data, error } = await query
    if (error) throw error
    return data ?? []
  }, [] as any[])

  const regras = await safe(async () => {
    let query: any = supabase
      .from('regua_compliance_regras')
      .select('id, carteira_id, canal, ativo, janela_inicio, janela_fim, limite_diario_destinatario, intervalo_minimo_minutos, permitir_finais_semana, carteiras(nome)')
      .order('created_at', { ascending: false })
      .limit(8)
    query = applyCarteiraScope(query, scope.carteiraIds)
    const { data, error } = await query
    if (error) throw error
    return data ?? []
  }, [] as any[])

  const scores = await safe(async () => {
    let query: any = supabase
      .from('regua_inteligencia_scores')
      .select('id, carteira_id, cobranca_id, acordo_id, score_recuperacao, risco_quebra, prioridade_operacional, melhor_canal, intensidade_sugerida, recomendacao, calculado_em')
      .order('calculado_em', { ascending: false })
      .limit(8)
    query = applyCarteiraScope(query, scope.carteiraIds)
    const { data, error } = await query
    if (error) throw error
    return data ?? []
  }, [] as any[])

  return {
    jobs,
    pausas,
    regras,
    scores,
    metrics: {
      jobs: jobs.length,
      pausas: pausas.length,
      regras: regras.length,
      scores: scores.length,
      erros: jobs.filter((job: any) => job.status === 'erro').length,
    },
  }
}
