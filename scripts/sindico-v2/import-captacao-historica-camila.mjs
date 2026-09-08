import fs from 'node:fs/promises'
import path from 'node:path'
import nextEnv from '@next/env'
import { createClient } from '@supabase/supabase-js'

const { loadEnvConfig } = nextEnv
loadEnvConfig(process.cwd())

const workspace = process.cwd()
const defaultSource = path.join(workspace, '.codex-tmp/camila-conciliacao/reconciliation.json')
const source = process.argv[2] ?? defaultSource
const origem = 'camila_cronograma_2026_01_07'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error('Variáveis de ambiente administrativas do Supabase não configuradas.')
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
})

const data = JSON.parse(await fs.readFile(source, 'utf8'))
const hashByFile = new Map()
for (const item of data.fontes ?? []) hashByFile.set(item.arquivo, item.sha256)

const rows = (data.rows ?? [])
  .filter((row) => row.principal && row.apto_historico)
  .sort((a, b) => a.mes_arquivo.localeCompare(b.mes_arquivo) || a.aba.localeCompare(b.aba) || a.linha - b.linha)

if (!rows.length) throw new Error('Nenhuma linha liberada para importação.')

const payload = rows.map((row) => ({
  origem,
  fonte_arquivo: row.arquivo,
  fonte_aba: row.aba,
  fonte_linha: row.linha,
  fonte_hash: hashByFile.get(row.arquivo) ?? null,
  item_key: `${row.arquivo}:${row.aba}:${row.linha}`,
  condominio_id: row.condominio_id,
  unidade_id: row.unidade_id,
  competencia: row.ciclo_entrada,
  data_entrada: row.entrada,
  valor: row.valor,
  debito_descricao: row.debito_origem || null,
  unidade_identificacao: row.unidade_origem,
  bloco: row.bloco_origem || null,
  metadata: {
    condominio_origem: row.condominio_origem,
    codigo_cedrus: row.codigo_cedrus || null,
    unidade_origem: row.unidade_origem,
    bloco_origem: row.bloco_origem || null,
    mes_arquivo: row.mes_arquivo,
    metodo_condominio: row.metodo_condominio,
  },
}))

for (let index = 0; index < payload.length; index += 200) {
  const lote = payload.slice(index, index + 200)
  const { error } = await supabase
    .from('captacao_historica_sindico')
    .upsert(lote, { onConflict: 'origem,fonte_arquivo,fonte_aba,fonte_linha' })

  if (error) throw new Error(`Erro ao importar lote histórico: ${error.message}`)
}

const { data: conferidas, error: conferirError } = await supabase
  .from('captacao_historica_sindico')
  .select('competencia, valor')
  .eq('origem', origem)
  .limit(1000)

if (conferirError) throw new Error(`Erro ao conferir importação: ${conferirError.message}`)

const porCompetencia = new Map()
for (const row of conferidas ?? []) {
  const atual = porCompetencia.get(row.competencia) ?? { linhas: 0, valor: 0 }
  atual.linhas += 1
  atual.valor = Math.round((atual.valor + Number(row.valor ?? 0) + Number.EPSILON) * 100) / 100
  porCompetencia.set(row.competencia, atual)
}

console.log(JSON.stringify({
  origem,
  liberadas: payload.length,
  conferidas: conferidas?.length ?? 0,
  porCompetencia: Object.fromEntries([...porCompetencia.entries()].sort()),
}, null, 2))
