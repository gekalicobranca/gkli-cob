import { readFile } from 'node:fs/promises'
import { bancoDocumentos } from '../manager-acordos/documentos.mjs'
import { verificarConfiguracao } from './integracao.mjs'

const db = bancoDocumentos()
const manifest = JSON.parse(await readFile(new URL('./condominios.json', import.meta.url), 'utf8'))
const { data: condos, error } = await db.from('condominios').select('id,nome,status,administradora,carteira_id').in('id', manifest.condominios.map(c => c.condominio_id))
if (error) throw error
const registros = manifest.condominios.map(({ nome: _nome, ...c }) => {
  const condo = condos.find(co => co.id === c.condominio_id)
  if (!condo || condo.status !== 'ativo' || condo.carteira_id !== c.carteira_id || condo.administradora.toLowerCase() !== c.administradora.toLowerCase()) throw new Error(`Cadastro mudou para ${c.condominio_id}; revise o manifesto.`)
  if (c.habilitado) verificarConfiguracao(c, condo, c)
  return c
})
const { error: seed } = await db.from('agente_acordos_configuracoes').upsert(registros, { onConflict: 'condominio_id' })
if (seed) throw seed
console.log(`${registros.length} configurações exclusivas cadastradas; ${registros.filter(c => c.habilitado).length} habilitadas. Nenhum cadastro financeiro ou receita alterado.`)
