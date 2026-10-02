import { NextResponse } from 'next/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { withFlowBudget } from '@/lib/jobs/flow-execution'

function hasFailure(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false
  return Object.entries(value).some(([key, item]) =>
    (key === 'erro' && Boolean(item)) || (key === 'status' && item === 'atencao') || hasFailure(item))
}

export async function runFlowJob(name: 'montar' | 'progredir', work: () => Promise<object>) {
  // This client stays outside the work budget so cleanup can run after timeout.
  const db = createAdminClient()
  let token: string | null = null
  const started = Date.now()
  try {
    const claim = await db.rpc('flows_job_reservar', { p_job: name }).abortSignal(AbortSignal.timeout(10_000))
    if (claim.error) throw new Error(`Não foi possível reservar o job: ${claim.error.message}`)
    token = claim.data
    if (!token) return NextResponse.json({ ok: true, skipped: true, motivo: 'concorrencia_ou_backoff' })
    const result = await withFlowBudget(work)
    const failed = hasFailure(result)
    const finish = await db.rpc('flows_job_concluir', { p_job: name, p_token: token, p_sucesso: !failed })
      .abortSignal(AbortSignal.timeout(10_000))
    if (finish.error) throw new Error(`Não foi possível concluir a reserva: ${finish.error.message}`)
    if (!finish.data) throw new Error('Reserva do job expirada; conclusão recusada.')
    console.info('[flows-job]', { job: name, durationMs: Date.now() - started, failed })
    return NextResponse.json({ ok: !failed, ...result }, { status: failed ? 500 : 200 })
  } catch (error) {
    if (token) {
      const finish = await db.rpc('flows_job_concluir', { p_job: name, p_token: token, p_sucesso: false })
        .abortSignal(AbortSignal.timeout(10_000))
      if (finish.error) console.error('[flows-job] Falha ao registrar backoff', { job: name, code: finish.error.code })
    }
    console.error('[flows-job]', { job: name, durationMs: Date.now() - started, failed: true })
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : 'Falha no job de flows.' }, { status: 500 })
  }
}
