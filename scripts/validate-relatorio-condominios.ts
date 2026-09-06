import assert from 'node:assert/strict'
import { mkdirSync, writeFileSync } from 'node:fs'
import { montarRelatorioCondominios } from '../features/condominios/relatorio-executivo'
import { sortCondominios } from '../features/condominios/sort'
import type { CondominioRelatorio } from '../features/condominios/relatorio-executivo'
import parsePdf from 'pdf-parse/lib/pdf-parse.js'

async function main() {
  const row: CondominioRelatorio = {
    id: 'teste-1', agente_remoto_status: 'configurado', carteira_id: 'carteira-1', carteiras: { nome: 'Carteira São Paulo' },
    nome: 'CONDOMÍNIO RESIDENCIAL JARDINS DO IPIRANGA', nome_operacional: 'JARDINS DO IPIRANGA',
    cnpj: '00.000.000/0001-00', status: 'ativo', classificacao_operacional: 'ouro',
    administradora: 'Administradora Exemplo', endereco_logradouro: 'Avenida das Acácias', endereco_numero: '1200',
    endereco_complemento: 'Torre A', endereco_bairro: 'Ipiranga', endereco_cidade: 'São Paulo', endereco_uf: 'SP', endereco_cep: '00000-000',
    sindico_email: 'sindico@example.com', sindico_celular: '(11) 90000-0000', gerente_email: 'gerente@example.com', gerente_celular: '(11) 90000-0001',
    vencimento_cota_dia: 10, valor_cota_condominial: 850.25, inicio_cobranca_dias: 30, dias_cobranca_ativa: 60,
    pre_juridico_habilitado: true, dias_expiracao_regua_pre_juridico: 30, parcelas_acordo_sem_aprovacao_sindico: 0,
    dias_reemissao_parcela_acordo_atrasada: 0, regua_cobranca_id: 'regua-1', operacao_virtual_habilitada: true,
    captacao_automatica_habilitada: true, captacao_dia_mes: 10, captacao_horario: '08:00:00',
    bloqueio_garantidora_habilitado: true, bloqueio_garantidora_inicio: '2026-01-01', bloqueio_garantidora_fim: '2026-03-01',
    created_at: '2026-09-01T12:00:00Z', observacoes: 'Cadastro demonstrativo para validação do relatório.',
  }
  const missing: CondominioRelatorio = { id: 'teste-2', nome: 'CONDOMÍNIO SEM DADOS OPCIONAIS', status: 'inativo', valor_cota_condominial: 0 }
  const reguas = new Map([['regua-1', 'Régua de cobrança extrajudicial']])
  const date = new Date('2026-09-06T15:00:00Z')
  const output = '.codex-tmp/condominios-report'
  mkdirSync(output, { recursive: true })
  const sample = montarRelatorioCondominios([row, missing], reguas, ['Status: todos'], date)
  writeFileSync(`${output}/sample.pdf`, sample)
  const parsed = await parsePdf(sample)
  assert.ok(parsed.text.includes('Receita de agente remoto configurada\nSim'))
  for (const [status, label] of [['nao_configurado', 'Não'], ['indisponivel', 'Não foi possível verificar']] as const) {
    const result = await parsePdf(montarRelatorioCondominios([{ ...row, agente_remoto_status: status }], reguas, [], date))
    assert.ok(result.text.includes(`Receita de agente remoto configurada\n${label}`))
  }
  for (const expected of ['JARDINS DO IPIRANGA', 'Régua de cobrança extrajudicial', 'Não permitida (0 dias)', 'Não informado', '01/2026 a 03/2026', '850,25', '0,00', 'Status: todos']) assert.ok(parsed.text.replace(/\s+/g, ' ').includes(expected), expected)
  const empty = montarRelatorioCondominios([], reguas, ['Status: suspenso'], date)
  writeFileSync(`${output}/empty.pdf`, empty)
  const parsedEmpty = await parsePdf(empty)
  assert.equal(parsedEmpty.numpages, 2)
  assert.ok(parsedEmpty.text.includes('Nenhum condomínio encontrado'))
  const stressRows = Array.from({ length: 45 }, (_, i) => ({ ...row, id: `stress-${i}`, carteira_id: `carteira-${i}`, carteiras: { nome: `Carteira ${i} ${'Nome extenso '.repeat(8)}` }, nome_operacional: `Condomínio ${i} ${'Nome extenso '.repeat(8)}`, sindico_email: `${'emailmuitolongo'.repeat(35)}@example.com`, observacoes: 'Observações extensas com acentuação. '.repeat(100) + 'MARCADOR FINAL' }))
  const stress = montarRelatorioCondominios(stressRows, reguas, ['Busca: ' + 'filtro longo '.repeat(100)], date)
  writeFileSync(`${output}/stress.pdf`, stress)
  const parsedStress = await parsePdf(stress)
  assert.equal((parsedStress.text.match(/MARCADOR FINAL/g) || []).length, 45)
  // Every text baseline must stay above the footer and inside the page.
  for (const buffer of [sample, empty, stress]) {
    for (const match of buffer.toString('latin1').matchAll(/([\d.]+) ([\d.]+) Td \(/g)) {
      const [, x, y] = match.map(Number)
      assert.ok(x >= 0 && x < 595 && y >= 16 && y < 842, `Invalid baseline: ${x}, ${y}`)
    }
  }
  assert.equal(sortCondominios([row, missing], 'cota_asc')[0].id, missing.id)
  assert.equal(sortCondominios([row, missing], 'cota_desc')[0].id, row.id)
  console.log(`PDF validation passed: sample ${parsed.numpages} pages, empty ${parsedEmpty.numpages}, stress ${parsedStress.numpages}.`)
}
main().catch(error => { console.error(error); process.exitCode = 1 })
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'
import { applyCarteiraIdsScope } from '../utils/auth/carteira-scope'
import { normalizeRelationsList } from '../utils/supabase/normalize-relation'

function loadWithMocks(path: string, mocks: Record<string, unknown>) {
  const exports: Record<string, any> = {}
  const js = ts.transpileModule(readFileSync(path, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText
  runInNewContext(js, { exports, require: (id: string) => { assert.ok(id in mocks, `Unexpected dependency ${id}`); return mocks[id] }, Request, Response, URL, Uint8Array, console })
  return exports
}

async function validateScopeAndFilters() {
  const database = Array.from({ length: 1205 }, (_, i) => ({ id: String(i), nome: `Condomínio ${i}`, carteira_id: i < 1100 ? 'permitida' : 'outra', status: i % 2 ? 'inativo' : 'ativo', carteiras: [{ nome: 'Carteira' }] }))
  const ranges: number[][] = []
  const client = { from: () => {
    let filtered = [...database]
    let start = 0, end = 999
    const query = {
      select: () => query, order: () => query,
      eq: (key: string, value: unknown) => { filtered = filtered.filter(row => row[key] === value); return query },
      in: (key: string, values: unknown[]) => { filtered = filtered.filter(row => values.includes(row[key])); return query },
      range: (a: number, b: number) => { start = a; end = b; ranges.push([a, b]); return query },
      then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data: filtered.slice(start, end + 1), error: null }).then(resolve),
    }
    return query
  } }
  const queries = loadWithMocks('features/condominios/queries.ts', {
    '@/utils/supabase/server': { createClient: async () => client },
    '@/utils/auth/apply-carteira-scope': { applyCarteiraScope: applyCarteiraIdsScope },
    '@/utils/supabase/normalize-relation': { normalizeRelationsList },
  })
  const scope = { carteiraIds: ['permitida'] }
  const all = await queries.listCondominios(scope, {}, { all: true })
  assert.equal(all.length, 1100)
  assert.equal(new Set(all.map(row => row.id)).size, 1100)
  assert.deepEqual(ranges, [[0, 499], [500, 999], [1000, 1499]])
  assert.equal((await queries.listCondominios(scope, { status: 'ativo' }, { all: true })).length, 550)
  assert.equal((await queries.listCondominios(scope, { carteiraId: 'outra' }, { all: true })).length, 0)
  assert.equal((await queries.listCondominios({ carteiraIds: [] }, {}, { all: true })).length, 0)
  assert.equal((await queries.listCondominios({ carteiraIds: null }, {}, { all: true })).length, 1205)

  let received: any
  const route = loadWithMocks('app/api/condominios/relatorio-executivo/route.ts', {
    '@/utils/auth/get-permitted-carteiras': { getPermittedCarteiras: async () => scope },
    '@/utils/supabase/server': { createClient: async () => client },
    '@/features/condominios/queries': { normalizeCondominioFilters: queries.normalizeCondominioFilters, listCondominios: async (...args: unknown[]) => { received = args; return [] } },
    '@/features/condominios/sort': { sortCondominios },
    '@/features/condominios/relatorio-executivo': { montarRelatorioCondominios },
    '@/features/agente-automatico/queries': { getCondominiosAgenteStatus: async () => new Map() },
  })
  const response = await route.GET(new Request('http://localhost/api/condominios/relatorio-executivo?status=&q=Jardins&carteira_id=permitida&administradora=Exemplo&page=2'))
  assert.equal(response.headers.get('content-type'), 'application/pdf')
  assert.equal(response.headers.get('cache-control'), 'no-store')
  assert.equal(received[0], scope)
  assert.equal(received[1].status, undefined)
  assert.equal(received[1].search, 'Jardins')
  assert.equal(received[1].administradora, 'Exemplo')
  assert.equal(received[1].carteiraId, 'permitida')
  assert.equal(received[2].all, true)
  await route.GET(new Request('http://localhost/api/condominios/relatorio-executivo'))
  assert.equal(received[1].status, 'ativo')
  console.log('Scope, pagination, filters and PDF response validation passed.')
}
validateScopeAndFilters().catch(error => { console.error(error); process.exitCode = 1 })
