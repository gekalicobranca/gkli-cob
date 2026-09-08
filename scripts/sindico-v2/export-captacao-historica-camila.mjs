import fs from 'node:fs/promises'
import path from 'node:path'

const workspace = process.cwd()
const defaultSource = path.join(workspace, '.codex-tmp/camila-conciliacao/reconciliation.json')
const defaultOutput = path.join(workspace, 'outputs/camila-conciliacao-20260907/captacao-historica-camila-2026-01-07.sql')

const source = process.argv[2] ?? defaultSource
const output = process.argv[3] ?? defaultOutput
const origem = 'camila_cronograma_2026_01_07'

function sql(value) {
  if (value === null || value === undefined || value === '') return 'null'
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'null'
  return `'${String(value).replaceAll("'", "''")}'`
}

function jsonb(value) {
  return `${sql(JSON.stringify(value))}::jsonb`
}

const data = JSON.parse(await fs.readFile(source, 'utf8'))
const hashByFile = new Map()
for (const item of data.fontes ?? []) hashByFile.set(item.arquivo, item.sha256)

const rows = (data.rows ?? [])
  .filter((row) => row.principal && row.apto_historico)
  .sort((a, b) => a.mes_arquivo.localeCompare(b.mes_arquivo) || a.aba.localeCompare(b.aba) || a.linha - b.linha)

const values = rows.map((row) => {
  const metadata = {
    condominio_origem: row.condominio_origem,
    codigo_cedrus: row.codigo_cedrus || null,
    unidade_origem: row.unidade_origem,
    bloco_origem: row.bloco_origem || null,
    mes_arquivo: row.mes_arquivo,
    metodo_condominio: row.metodo_condominio,
  }
  return `  (${[
    sql(origem),
    sql(row.arquivo),
    sql(row.aba),
    sql(row.linha),
    sql(hashByFile.get(row.arquivo)),
    sql(`${row.arquivo}:${row.aba}:${row.linha}`),
    sql(row.condominio_id),
    sql(row.unidade_id),
    sql(row.ciclo_entrada),
    sql(row.entrada),
    sql(row.valor),
    sql(row.debito_origem || null),
    sql(row.unidade_origem),
    sql(row.bloco_origem || null),
    jsonb(metadata),
  ].join(', ')})`
}).join(',\n')

const content = `-- Captação histórica Camila, arquivos 01/2026 a 07/2026.
-- Gerado somente com linhas liberadas pela conciliação: condomínio e unidade vinculados, ciclo válido, valor informado e sem repetição exata.
-- Registros retidos permanecem fora desta carga e devem ser saneados antes de entrar no sistema.

insert into public.captacao_historica_sindico (
  origem,
  fonte_arquivo,
  fonte_aba,
  fonte_linha,
  fonte_hash,
  item_key,
  condominio_id,
  unidade_id,
  competencia,
  data_entrada,
  valor,
  debito_descricao,
  unidade_identificacao,
  bloco,
  metadata
)
values
${values}
on conflict (origem, fonte_arquivo, fonte_aba, fonte_linha) do update set
  fonte_hash = excluded.fonte_hash,
  condominio_id = excluded.condominio_id,
  unidade_id = excluded.unidade_id,
  competencia = excluded.competencia,
  data_entrada = excluded.data_entrada,
  valor = excluded.valor,
  debito_descricao = excluded.debito_descricao,
  unidade_identificacao = excluded.unidade_identificacao,
  bloco = excluded.bloco,
  metadata = excluded.metadata,
  updated_at = now();
`

if (!rows.length) throw new Error('Nenhuma linha liberada para exportação.')
await fs.mkdir(path.dirname(output), { recursive: true })
await fs.writeFile(output, content, 'utf8')
console.log(JSON.stringify({ output, liberadas: rows.length }, null, 2))
