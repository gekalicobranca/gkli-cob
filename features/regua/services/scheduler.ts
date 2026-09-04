import { createAdminClient } from '@/utils/supabase/admin'
import { processarReguaCobranca } from './processar-regua-cobranca'
import { processarReguaAcordos } from './processar-regua-acordos'
import { registrarEventoOperacional } from '@/features/operacional/service'
import { executarDisparosPreJuridico } from '@/features/pre-juridico/dispatcher'
import { executarDisparosWhatsapp } from '@/features/mensageria/whatsapp-cloud/dispatcher'

type SchedulerParams = {
  origem?: 'cron' | 'manual' | 'api'
  executarCobranca?: boolean
  executarAcordos?: boolean
  executarPreJuridico?: boolean
  executarWhatsapp?: boolean
  dryRun?: boolean
}

async function criarJob(tipo: string, origem: string) {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('regua_jobs')
    .insert({ tipo, origem, status: 'processando', iniciado_em: new Date().toISOString() } as any)
    .select('id')
    .single()

  if (error) {
    if (error.code === '42P01') return null
    throw new Error(`Erro ao criar job da régua: ${error.message}`)
  }
  return (data as any)?.id as string
}

async function finalizarJob(jobId: string | null, status: string, resumo: Record<string, unknown>, erro?: string | null) {
  if (!jobId) return
  const supabase = createAdminClient()
  await supabase
    .from('regua_jobs')
    .update({ status, resumo, erro: erro ?? null, finalizado_em: new Date().toISOString() } as any)
    .eq('id', jobId)
}

export async function executarSchedulerReguas(params: SchedulerParams = {}) {
  const origem = params.origem ?? 'cron'
  const supabase = createAdminClient()
  const resultados: Record<string, any> = {}
  const erros: string[] = []

  if (params.dryRun) {
    return { ok: true, dryRun: true, cobranca: params.executarCobranca !== false, acordos: params.executarAcordos !== false, preJuridico: params.executarPreJuridico === true, whatsapp: params.executarWhatsapp !== false }
  }

  if (params.executarCobranca !== false) {
    const jobId = await criarJob('regua_cobranca', origem)
    try {
      resultados.cobranca = await processarReguaCobranca({ origem, cooldownDias: 3 })
      await finalizarJob(jobId, 'concluido', resultados.cobranca)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Erro inesperado na régua de cobrança.'
      erros.push(message)
      await finalizarJob(jobId, 'erro', {}, message)
    }
  }

  if (params.executarAcordos !== false) {
    const jobId = await criarJob('regua_acordo', origem)
    try {
      resultados.acordos = await processarReguaAcordos({ origem })
      await finalizarJob(jobId, 'concluido', resultados.acordos)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Erro inesperado na régua de acordos.'
      erros.push(message)
      await finalizarJob(jobId, 'erro', {}, message)
    }
  }

  if (params.executarPreJuridico === true) {
    const jobId = await criarJob('regua_pre_juridico', origem)
    try {
      resultados.preJuridico = await executarDisparosPreJuridico()
      await finalizarJob(jobId, 'concluido', resultados.preJuridico)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Erro inesperado nos disparos pré-jurídicos.'
      erros.push(message)
      await finalizarJob(jobId, 'erro', {}, message)
    }
  }

  if (params.executarWhatsapp !== false) {
    const jobId = await criarJob('whatsapp_dispatcher', origem)
    try {
      resultados.whatsapp = await executarDisparosWhatsapp()
      await finalizarJob(jobId, 'concluido', resultados.whatsapp)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Erro inesperado nos disparos do WhatsApp.'
      erros.push(message)
      await finalizarJob(jobId, 'erro', {}, message)
    }
  }

  await registrarEventoOperacional(supabase as any, {
    carteiraId: null,
    entidadeTipo: 'regua_scheduler' as any,
    entidadeId: 'scheduler',
    eventoCodigo: erros.length ? 'regua.scheduler_falhou' : 'regua.scheduler_concluido',
    titulo: erros.length ? 'Scheduler de réguas concluído com falhas' : 'Scheduler de réguas concluído',
    descricao: erros.join(' | ') || 'Execução automática das réguas finalizada.',
    severidade: erros.length ? 'alerta' : 'info',
    payload: { origem, resultados, erros },
  })

  return { ok: erros.length === 0, origem, resultados, erros }
}
