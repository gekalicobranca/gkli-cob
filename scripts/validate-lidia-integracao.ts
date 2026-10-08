import assert from 'node:assert/strict'
import { createClient } from '@supabase/supabase-js'
import { AGENTES_VIRTUAIS } from '../features/agentes-virtuais/perfis'
import { carregarCaso, registrarCasoKeila } from '../features/keila/casos-service'
import { getKeilaCasos } from '../features/keila/queries'

async function main() {
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
  const perfil = AGENTES_VIRTUAIS.lidia
  const casoId = '96997362-7681-5725-a58e-736c36e7c14a'
  const caso = await carregarCaso(db, casoId, [perfil.carteiraId], 'lidia')
  assert.equal(caso.tipo, 'lidia_atendimento')
  assert.equal(caso.payload.envio_permitido, false)
  assert.equal(caso.payload.emails.length, 0)
  assert.equal(caso.condominio_id, perfil.pilotoCondominioId)
  await assert.rejects(() => carregarCaso(db, casoId, null, 'keila'))
  await assert.rejects(() => carregarCaso(db, casoId, ['e1f6e3ac-1098-4b30-9e0f-af4c47b351a3'], 'lidia'))
  await assert.rejects(() => registrarCasoKeila(db, { agenteId: 'lidia', condominioId: '2b1aa7ca-91d6-44fc-b667-8fb9bfeffb53', unidadeIds: [], titulo: 'Inválido — não gravar', intencao: 'outro', emails: [], proximaAcao: 'Nenhuma', referencia: 'validacao-negativa-nao-gravar', usuarioId: null, carteiraIds: null }))
  const scope = { userId: '', perfil: 'admin', isAdmin: true, carteiraIds: null }
  const dados = await getKeilaCasos(scope, casoId, perfil.pilotoCondominioId, 'lidia')
  assert.ok(dados.casos.some(c => c.id === casoId))
  assert.ok(dados.casos.every(c => c.condominio_id === perfil.pilotoCondominioId))
  assert.ok(dados.condominios.every((c: any) => c.id === perfil.pilotoCondominioId))
  await assert.rejects(() => getKeilaCasos({ ...scope, carteiraIds: ['outra'] }, casoId, perfil.pilotoCondominioId, 'lidia'))
  await assert.rejects(() => getKeilaCasos(scope, casoId, '2b1aa7ca-91d6-44fc-b667-8fb9bfeffb53', 'lidia'))
  console.log('Lidia: cadastro real, consultas da tela e recusas por agente/carteira/condomínio validados. Nenhum e-mail enviado ou dado financeiro alterado.')
}
main().catch(e => { console.error(e); process.exitCode = 1 })
