import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { buildFlowConfigExport, sanitizeConfig } from '../features/flows/config-export'

async function main() {
  assert.deepEqual(sanitizeConfig({ config: { accessToken: 'SECRET', senha: 'SECRET', cookies: 'SECRET', host: 'smtp.test' } }),
    { config: { accessToken: { secret_required: true }, senha: { secret_required: true }, cookies: { secret_required: true }, host: 'smtp.test' } })
  const content = 'Olá {{nome}}!\n{debito} %valor%'
  const fixtures: Record<string, any[]> = {
    mensagens_templates: [{ id: 't1', conteudo: content, ativo: false, analytics: { enviados: 50 } }],
    reguas: [{ id: 'r1' }, { id: 'r2', carteira_id: 'missing' }],
    regua_etapas: [{ id: 'e1', regua_id: 'r1', template_id: 't1', ordem: 2 }, { id: 'e2', regua_id: 'r1', template_id: 'missing', ordem: 1 },
      { id: 'e3', regua_id: 'missing', ordem: 1 }],
    carteiras: [], integracoes_smtp_config: [{ id: 's1', senha: 'SECRET' }],
    whatsapp_web_sessoes: [{ id: 'session', numero: '123' }], whatsapp_worker_controles: [], regua_compliance_regras: [],
  }
  const requested: string[] = []
  const mock = { from(table: string) {
    requested.push(table)
    return { select() { return { order() { return { async range(start: number, end: number) {
      return { data: fixtures[table].slice(start, end + 1), error: null }
    } } } } } }
  } }
  const result = await buildFlowConfigExport(mock as any, {})
  assert.equal(result.data.templates[0].conteudo, content)
  assert.equal(result.data.templates[0].analytics, undefined)
  assert.equal(result.data.etapas[0].id, 'e3')
  assert(result.validation.warnings.some(w => w.includes('template inexistente')))
  assert(result.validation.warnings.some(w => w.includes('template inativo')))
  assert(result.validation.warnings.some(w => w.includes('sem etapas')))
  assert(result.validation.warnings.some(w => w.includes('carteira inexistente')))
  assert(result.validation.warnings.some(w => w.includes('régua inexistente')))
  assert(!JSON.stringify(result).includes('SECRET'))
  assert(!requested.some(t => ['mensagens', 'cobrancas', 'regua_jobs', 'agente_workers'].includes(t)))
  const broken = { from() { return { select() { return { order() { return { async range() { return { error: { code: 'network' } } } } } } } } } }
  await assert.rejects(() => buildFlowConfigExport(broken as any, {}), /Exportação cancelada/)
  const artifact = process.argv[2] ? JSON.parse(await readFile(process.argv[2], 'utf8')) : result
  assert.equal(artifact.schema, 'gkli-flow-config-export')
  function check(value: any) {
    if (!value || typeof value !== 'object') return
    for (const [key, item] of Object.entries(value)) {
      if (/senha|password|access.?token|app.?secret|cookie/i.test(key)) assert.deepEqual(item, { secret_required: true })
      else check(item)
    }
  }
  check(artifact)
  console.log('Exportação validada: placeholders, segredos, referências, leitura exclusiva e falha sem arquivo parcial.')
}
main().catch(e => { console.error(e.message); process.exitCode = 1 })
