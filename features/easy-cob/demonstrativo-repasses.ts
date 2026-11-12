import { createHash } from 'node:crypto'
import * as XLSX from 'xlsx'
import { dataCivilSaoPaulo } from '@/lib/core/data-civil'
import { lerRepassesCreditados } from '../../scripts/acordos-portais/espelhamento-repasses.mjs'

export async function lerDemonstrativoRepasses(arquivo: File) {
  if (!arquivo.name.toLowerCase().endsWith('.csv') || !arquivo.size || arquivo.size > 256 * 1024) {
    throw new Error('Envie um CSV de repasses com até 256 KB.')
  }
  const bytes = Buffer.from(await arquivo.arrayBuffer())
  const texto = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  const workbook = XLSX.read(texto, { type: 'string', raw: true, FS: ';' })
  const rows = XLSX.utils.sheet_to_json<string[]>(workbook.Sheets[workbook.SheetNames[0]], { header: 1, blankrows: false, raw: true })
  const cabecalho = rows[0]?.map(x => String(x).trim().normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()) ?? []
  const coluna = cabecalho.indexOf('cnpj')
  const cnps = new Set(rows.slice(1).map(r => String(r[coluna] ?? '').replace(/\D/g, '')))
  const [cnpj] = cnps
  const repasses = lerRepassesCreditados([rows])
  if (coluna < 0 || cnps.size !== 1 || !/^\d{14}$/.test(cnpj ?? '') || !repasses.length || repasses.length !== rows.length - 1
    || repasses.some(r => r.dataCredito > dataCivilSaoPaulo()) || new Set(repasses.map(r => r.referencia)).size !== repasses.length) {
    throw new Error('Confira CNPJ, recibos, referências únicas, datas de crédito e valores creditados no CSV.')
  }
  return { cnpj, sha256: createHash('sha256').update(bytes).digest('hex'), nome: arquivo.name, original: bytes.toString('base64'), repasses }
}
