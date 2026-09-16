import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'

async function main() {
  let canalTemplate = 'email'
  let ativo = true
  let carteiraTemplate: string | null = null
  let gravado: any = null
  const db = { from(table: string) {
    let payload: any
    const query: any = {
      select: () => query, eq: () => query,
      update: (value: any) => { payload = value; return query },
      insert: (value: any) => { payload = value; return query },
      single: async () => {
        if (table === 'reguas') return { data: { id: 'regua', carteira_id: 'carteira' }, error: null }
        if (table === 'mensagens_templates') return { data: { id: 'template', nome: 'Template escolhido', ativo, canal: canalTemplate, carteira_id: carteiraTemplate }, error: null }
        if (table === 'regua_etapas') { gravado = payload; return { data: { id: 'etapa' }, error: null } }
        throw new Error(`Tabela inesperada: ${table}`)
      },
    }
    return query
  } }
  const mocks: Record<string, unknown> = {
    'next/cache': { revalidatePath() {} },
    'next/navigation': { redirect() { throw new Error('Redirect inesperado') } },
    '@/utils/supabase/admin': { createAdminClient: () => db },
    '@/utils/auth/get-permitted-carteiras': { getPermittedCarteiras: async () => ({ carteiraIds: ['carteira'] }) },
    '@/utils/auth/require-user': { requireUser: async () => ({ id: 'user' }) },
    '@/features/operacional/service': { registrarEventoOperacional: async () => {} },
    '@/features/regua/services/regua-shared': { normalizarDestinatarioPreferencial: (value: string) => value },
  }
  const source = readFileSync('features/reguas/actions.ts', 'utf8')
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  const actions: any = {}
  new Function('require', 'exports', compiled)((name: string) => {
    assert.ok(name in mocks, `Dependência não simulada: ${name}`)
    return mocks[name]
  }, actions)
  const form = new FormData()
  for (const [key, value] of Object.entries({ etapa_id: 'etapa', nome: 'Primeira cobrança', canal: 'email', template_id: 'template' })) form.set(key, value)
  const result = await actions.salvarEtapaReguaComRetorno('regua', {}, form)
  assert.equal(gravado.template_id, 'template')
  assert.match(result.message, /Template escolhido/)
  gravado = null
  canalTemplate = 'whatsapp'
  assert.match((await actions.salvarEtapaReguaComRetorno('regua', {}, form)).error, /canal/)
  assert.equal(gravado, null)
  canalTemplate = 'email'; ativo = false
  assert.match((await actions.salvarEtapaReguaComRetorno('regua', {}, form)).error, /ativo/)
  assert.equal(gravado, null)
  ativo = true; carteiraTemplate = 'outra'
  assert.match((await actions.salvarEtapaReguaComRetorno('regua', {}, form)).error, /outra carteira/)
  assert.equal(gravado, null)
  form.set('template_id', '')
  assert.match((await actions.salvarEtapaReguaComRetorno('regua', {}, form)).message, /automática/)
  assert.equal(gravado.template_id, null)
  console.log('OK: template selecionado persistido e confirmado; automático explícito; canal, carteira e atividade validados sem alterar dados reais.')
}
main().catch(error => { console.error(error); process.exitCode = 1 })
