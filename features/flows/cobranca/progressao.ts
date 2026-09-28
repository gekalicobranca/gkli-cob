import { createAdminClient } from '@/utils/supabase/admin'
import { getEmailRemetenteKey } from '@/features/mensageria/email-provider'
import { processarReguaCobranca } from '@/features/regua/services/processar-regua-cobranca'
import { consolidarEmailsLote } from './consolidar-emails'

export async function processarProgressaoFlows() {
  const db = createAdminClient()
  const resultados = []
  const inicio = Date.now()
  // Pequenos lotes mantêm a rota abaixo do limite; o lease cobre interrupções.
  for (let n = 0; n < 5 && Date.now() - inicio < 90_000; n++) {
    const { data, error } = await db.rpc('flow_progressao_claim')
    if (error) throw new Error(error.message)
    const job = data?.[0]
    if (!job) break
    try {
      const { data: etapa, error: ee } = await db.from('regua_etapas').select('canal').eq('id', job.etapa_id).single()
      if (ee) throw new Error(ee.message)
      const remetente = etapa.canal === 'email' ? await getEmailRemetenteKey(job.carteira_id) : ''
      await processarReguaCobranca({ origem: 'cron', carteiraId: job.carteira_id, condominioId: job.condominio_id,
        cobrancaIds: job.cobranca_ids, reguaId: job.regua_id, cooldownDias: 0, loteRetomadaId: job.lote_id,
        progressao: { etapaId: job.etapa_id, primeiroEnvioEm: job.primeiro_envio_em, sequenciaId: job.id } })
      await consolidarEmailsLote(job.lote_id)
      const { data: flowId, error: fe } = await db.rpc('flow_progressao_finalizar', {
        p_job: job.id, p_token: job.token, p_remetente: remetente,
      })
      if (fe) throw new Error(fe.message)
      resultados.push({ id: job.id, flowId })
    } catch (error) {
      const motivo = error instanceof Error ? error.message : 'Falha na continuação do Flow.'
      const { error: ue } = await db.from('flow_progressao').update({ status: 'atencao', erro: motivo,
        token: null, lease_ate: null, updated_at: new Date().toISOString() }).eq('id', job.id).eq('token', job.token)
      if (ue) throw new Error(ue.message)
      resultados.push({ id: job.id, status: 'atencao', erro: motivo })
    }
  }
  return { processadas: resultados.length, resultados }
}
