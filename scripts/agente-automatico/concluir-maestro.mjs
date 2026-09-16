import path from 'node:path'
import { mkdir } from 'node:fs/promises'

// A origem é consultada no banco, inclusive quando o claim do worker não a retorna.
async function veioDoMaestro(supabase, execucaoId) {
  const { data, error } = await supabase.from('agente_execucoes').select('origem').eq('id', execucaoId).single()
  if (error) throw error
  return ['maestro', 'maestro_agendada', 'agenda_mensal'].includes(data?.origem)
}

export async function caminhoDownloadMaestro(supabase, execucaoId, pasta, nome) {
  // O observador da pasta Downloads não deve criar outra conversão para este arquivo.
  if (!await veioDoMaestro(supabase, execucaoId)) return path.join(pasta, nome)
  const destino = path.join(pasta, 'maestro', execucaoId)
  await mkdir(destino, { recursive: true })
  return path.join(destino, nome)
}

export async function concluirExecucaoMaestro(supabase, execucaoId, fetcher = fetch) {
  if (!await veioDoMaestro(supabase, execucaoId)) return false
  const base = String(process.env.CAPTACAO_MAESTRO_URL || process.env.CAPTACAO_ORQUESTRADOR_URL || process.env.NEXT_PUBLIC_APP_URL || '').replace(/\/$/, '')
  const secret = process.env.CAPTACAO_ORQUESTRADOR_SECRET || process.env.CRON_SECRET || process.env.REGUA_CRON_SECRET
  if (!base || !secret) throw new Error('Configure CAPTACAO_MAESTRO_URL e a credencial da automação para validar e importar o relatório do Maestro.')
  const response = await fetcher(`${base}/api/agente-automatico/execucoes/${execucaoId}/concluir`, {
    method: 'POST', headers: { authorization: `Bearer ${secret}` },
  })
  const result = await response.json()
  if (!response.ok || !result.ok) throw new Error(`Validação/importação automática: ${result.error || response.status}`)
  return true
}
