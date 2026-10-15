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

export async function concluirExecucaoMaestro(supabase, execucaoId, fetcher = fetch, sobDemanda = process.env.AGENTE_EXECUCAO_ID === execucaoId && process.env.AGENTE_SUPERVISIONADO !== 'true') {
  if (!await veioDoMaestro(supabase, execucaoId)) return false
  const base = String(process.env.CAPTACAO_MAESTRO_URL || process.env.CAPTACAO_ORQUESTRADOR_URL || process.env.NEXT_PUBLIC_APP_URL || '').replace(/\/$/, '')
  const secret = process.env.CAPTACAO_ORQUESTRADOR_SECRET || process.env.CRON_SECRET || process.env.REGUA_CRON_SECRET
  if (!base || !secret) throw new Error('Configure CAPTACAO_MAESTRO_URL e a credencial da automação para validar e importar o relatório do Maestro.')
  const response = await fetcher(`${base}/api/agente-automatico/execucoes/${execucaoId}/concluir`, {
    method: 'POST', headers: { authorization: `Bearer ${secret}` },
  })
  const result = await response.json()
  if (!response.ok || !result.ok) throw new Error(`Validação/importação automática: ${result.error || response.status}`)
  if (sobDemanda) {
    const limite = Date.now() + 20 * 60 * 1000
    for (let parte = 0; parte < 150 && Date.now() < limite; parte++) {
      const montagemResponse = await fetcher(`${base}/api/agente-automatico/execucoes/${execucaoId}/montar-flow`, {
        method: 'POST', headers: { authorization: `Bearer ${secret}` }, signal: AbortSignal.timeout(90_000),
      })
      const montagemResult = await montagemResponse.json()
      if (!montagemResponse.ok || !montagemResult.ok) throw new Error(`Montagem do flow: ${montagemResult.error || montagemResponse.status}`)
      if (montagemResult.montagem?.status === 'concluido') return true
      if (montagemResult.montagem?.status === 'atencao') throw new Error(`Montagem do flow requer revisão: ${montagemResult.montagem.erro || 'Consulte as pendências.'}`)
      await new Promise(resolve => setTimeout(resolve, 1000))
    }
    throw new Error('A montagem não terminou no prazo. Consulte a aba Flows antes de retomar.')
  }
  return true
}
