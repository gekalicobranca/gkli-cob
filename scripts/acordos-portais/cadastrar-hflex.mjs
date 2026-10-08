import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { bancoDocumentos } from '../manager-acordos/documentos.mjs'

const db = bancoDocumentos()
const manifest = JSON.parse(await readFile(new URL('./condominios.json', import.meta.url), 'utf8'))
const targets = manifest.condominios.filter(c => c.administradora === 'HFlex')
if (targets.length !== 3 || targets.some(c => c.habilitado)) throw new Error('Cadastro inicial HFlex precisa dos três alvos com validação pendente.')
const ids = targets.map(c => c.condominio_id)
const [condos, configs] = await Promise.all([
  db.from('condominios').select('id,nome,status,administradora,carteira_id').in('id', ids),
  db.from('agente_acordos_configuracoes').select('*').in('condominio_id', ids),
])
if (condos.error || configs.error) throw new Error('Não foi possível conferir os cadastros HFlex.')
if (configs.data.length) throw new Error('Já há configurações HFlex; preservar e revisar antes de cadastrar novamente.')
for (const c of targets) {
  const actual = condos.data.find(co => co.id === c.condominio_id)
  if (!actual || actual.status !== 'ativo' || actual.carteira_id !== c.carteira_id || !['hflex', 'h flex'].includes(actual.administradora.toLowerCase())) throw new Error('Condomínio HFlex divergente do cadastro confirmado.')
}
const dir = new URL('../../reports/hflex-acordos/', import.meta.url)
await mkdir(dir, { recursive: true })
await writeFile(new URL('cadastros-antes.json', dir), JSON.stringify({ condominios: condos.data, configuracoes: configs.data }, null, 2))
for (const c of targets) {
  const before = condos.data.find(co => co.id === c.condominio_id)
  const changed = await db.from('condominios').update({ administradora: 'HFlex' }).eq('id', c.condominio_id).eq('administradora', before.administradora).select('id')
  if (changed.error || changed.data.length !== 1) throw new Error('Não foi possível padronizar a administradora HFlex.')
}
const records = targets.map(({nome, ...c}) => c)
const inserted = await db.from('agente_acordos_configuracoes').insert(records)
if (inserted.error) throw inserted.error
const verified = await db.from('agente_acordos_configuracoes').select('condominio_id,administradora,codigo_cliente,habilitado,motivo_pendente').in('condominio_id', ids)
if (verified.error || verified.data.length !== 3 || verified.data.some(c => c.habilitado || c.administradora !== 'HFlex')) throw new Error('Verificação dos agentes HFlex falhou.')
await writeFile(new URL('cadastros-confirmados.json', dir), JSON.stringify({ cadastrado_em: new Date().toISOString(), agentes: verified.data }, null, 2))
console.log(JSON.stringify(verified.data, null, 2))
