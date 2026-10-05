import assert from 'node:assert/strict'
import { createClient } from '@supabase/supabase-js'
import { somenteExecucoesLiberadas } from './agente-automatico/execucoes-agendadas.mjs'

const requests = []
const db = createClient('https://agente.invalid', 'test-key', {
  auth: { persistSession: false },
  global: { fetch: async (url) => {
    requests.push(new URL(url))
    return Response.json([])
  } },
})
const agora = new Date('2026-10-02T15:00:00Z')
for (const ativo of [true, false]) {
  const { error } = await somenteExecucoesLiberadas(
    db.from('agente_execucoes').select('id').eq('status', 'pendente'), agora, ativo,
  ).order('created_at').limit(1)
  assert.equal(error, null)
  const filters = requests.at(-1).searchParams.getAll('or')
  assert.equal(filters[0], '(agendado_para.is.null,agendado_para.lte.2026-10-02T15:00:00.000Z)')
  assert.equal(filters.length, ativo ? 1 : 2)
  if (!ativo) {
    assert.equal(filters[1], '(origem.eq.manual,origem.eq.manual_agendada,origem.eq.manual_administradora,origem.like.manual_worker:*)')
    assert.ok(!filters[1].includes('maestro'))
    assert.ok(!filters[1].includes('agenda_mensal'))
  }
}
console.log('OK: consulta preserva horário e libera somente origens manuais com Maestro pausado.')
