import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { conciliarCobrancaImportada } from '../features/importacoes/cobrancas-conciliacao'

// Reprodução offline: nenhuma consulta ou escrita em produção.
async function main() {
  const [directory, ...extra] = process.argv.slice(2)
  if (!directory || extra.length) throw new Error('Informe somente a pasta com audit-evidence.json, audit-db.json e import-items.json.')
  const read = (name: string) => JSON.parse(readFileSync(join(directory, name), 'utf8').replace(/^\uFEFF/, ''))
  const audit = read('audit-evidence.json')
  const db = read('audit-db.json')
  const items = read('import-items.json')
  const groups = audit.groups.filter((group: any) => group.records.filter((row: any) => row.fila).length > 1)
  const counts = { novo: 0, ja_existente: 0, divergente: 0 }
  for (const group of groups) {
    const older = group.records.find((row: any) => row.conversao_relatorio_id)
    const newer = group.records.find((row: any) => row.importacao_id)
    assert.ok(older && newer, 'Grupo sem as duas origens; não omitir do replay.')
    const source = newer.fontes.find((row: any) => row.tipo === 'importacao')
    const item = items.find((row: any) => row.importacao_id === newer.importacao_id && row.linha === source?.linha)
    const candidate = db.cobrancas.find((row: any) => row.id === older.id)
    assert.ok(item && candidate, 'Evidência incompleta.')
    const query: any = {
      select: () => query, eq: () => query, order: () => query,
      range: async (from: number) => ({ data: from === 0 ? [candidate] : [], error: null }),
    }
    const p = item.payload
    const result = await conciliarCobrancaImportada({ from: () => query }, {
      carteira_id: p.carteira_id, condominio_id: p.condominio_id, unidade_id: p.unidade_id,
      competencia: p.competencia || null, vencimento: p.vencimento || null,
      valor_original: p.valor_original, valor_atualizado: p.valor_atualizado,
      recibo: p.recibo || null, referencia: p.referencia || null, observacoes: p.observacoes || null,
    })
    counts[result.status]++
  }
  assert.ok(groups.length > 0, 'Não há casos para validar.')
  assert.equal(counts.novo, 0, 'Regressão: um recibo auditado voltaria a ser inserido.')
  console.log(JSON.stringify({ snapshot: db.capturedAt, grupos: groups.length, resultado: counts }))
}
main().catch(error => { console.error(error); process.exitCode = 1 })
