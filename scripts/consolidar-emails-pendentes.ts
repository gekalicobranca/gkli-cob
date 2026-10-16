import { createClient } from '@supabase/supabase-js'
import { mkdirSync, writeFileSync } from 'node:fs'
import { planejarConsolidacaoEmailsPendentes } from '../features/flows/cobranca/consolidar-emails-pendentes'

async function main() {
  const ids = process.argv.filter(arg => arg.startsWith('--flow=')).map(arg => arg.slice(7))
  if (!ids.length) throw new Error('Informe os Flows com --flow=UUID. Sem --apply, apenas prepara o plano.')
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } })
  const { data: rows, error } = await db.from('mensagens').select('*,tentativas:email_tentativas(estado)').in('cobranca_flow_id', ids).order('id')
  if (error) throw error
  const cobrancaIds = [...new Set(rows.flatMap(m => [m.cobranca_id, ...(m.payload?.cobranca_ids ?? [])]).filter(Boolean))]
  const { data: cobrancas, error: ce } = await db.from('cobrancas').select('id,unidade_id,competencia,vencimento,valor_original,valor_atualizado').in('id', cobrancaIds)
  if (ce) throw ce
  const plano = planejarConsolidacaoEmailsPendentes(rows, cobrancas)
  mkdirSync('.local', { recursive: true })
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  writeFileSync(`.local/consolidacao-email-${stamp}.json`, JSON.stringify({ ids, rows, cobrancas, plano }, null, 2))
  console.log(JSON.stringify({ grupos: plano.length, mensagens_reunidas: plano.reduce((n, p) => n + p.ids.length, 0), parcelas: plano.map(p => p.payload.total_cobrancas), aplicar: process.argv.includes('--apply') }))
  if (!process.argv.includes('--apply')) return
  for (const grupo of plano) {
    const { data, error: e } = await db.rpc('email_consolidar_pendentes', { p_principal: grupo.principal, p_ids: grupo.ids, p_conteudo: grupo.conteudo, p_payload: grupo.payload })
    if (e) throw e
    console.log(JSON.stringify({ principal: grupo.principal, mensagens_canceladas: data }))
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1 })
