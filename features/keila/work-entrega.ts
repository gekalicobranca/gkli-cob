import { createHash } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import * as XLSX from 'xlsx'
import { z } from 'zod'
import { lerCasoPayload } from './casos'
import { ORIGEM_WORK_KEILA, periodoWorkKeila, STATUS_WORK_KEILA } from './work-github'

const BUCKET = 'agente-relatorios'
const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
export const LIMITE_RELATORIO_WORK = 4_000_000

export async function carregarEntregaWork(db: SupabaseClient, id: string, carteiras: string[] | null) {
  if (!z.uuid().safeParse(id).success) return null
  let query = db.from('agente_execucoes')
    .select('id,created_at,receita_id,carteira_id,condominio_id,status,work_caso_id')
    .eq('id', id).eq('origem', ORIGEM_WORK_KEILA)
    .in('status', [STATUS_WORK_KEILA, 'sucesso'])
  if (carteiras !== null) query = query.in('carteira_id', carteiras)
  const { data: execucao, error } = await query.maybeSingle()
  if (error) throw new Error('Não foi possível consultar o pedido.')
  if (!execucao?.work_caso_id) return null
  const [caso, receita, condominio] = await Promise.all([
    db.from('central_pendencias').select('id,payload,status').eq('id', execucao.work_caso_id)
      .eq('tipo', 'keila_atendimento').eq('condominio_id', execucao.condominio_id).eq('carteira_id', execucao.carteira_id).maybeSingle(),
    db.from('agente_receitas').select('config_json').eq('id', execucao.receita_id).eq('script_key', 'captacao_lello').maybeSingle(),
    db.from('condominios').select('nome').eq('id', execucao.condominio_id).eq('carteira_id', execucao.carteira_id).maybeSingle(),
  ])
  if (caso.error || receita.error || condominio.error) throw new Error('Não foi possível conferir os dados do pedido.')
  const payload = lerCasoPayload(caso.data?.payload)
  if (!caso.data || !condominio.data || !receita.data || payload?.execucao_id !== id) return null
  if (execucao.status === STATUS_WORK_KEILA && (['resolvida', 'cancelada'].includes(caso.data.status) ||
    ['atendimento_humano', 'concluido'].includes(payload.estado))) return null
  const codigo = String(receita.data.config_json?.codigo_portal || receita.data.config_json?.codigo_cliente || '').trim()
  if (!/^\d+$/.test(codigo)) throw new Error('Código Lello do condomínio indisponível.')
  return { execucao, casoId: caso.data.id, codigo, condominio: condominio.data.nome, periodo: periodoWorkKeila(execucao.created_at) }
}

function normalizar(texto: string) {
  return texto.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase()
    .replace(/^CONDOMINIO\s+/, '').replace(/\s+/g, ' ').trim()
}

export function validarRelatorioWork(bytes: Buffer, codigo: string, condominio: string, periodo: { de: string; ate: string }) {
  if (bytes.length > LIMITE_RELATORIO_WORK || bytes.subarray(0, 4).toString('hex') !== '504b0304') {
    throw new Error('Envie o XLSX original exportado pela Lello, de até 4 MB.')
  }
  const workbook = XLSX.read(bytes, { type: 'buffer', sheetRows: 12, sheets: 'Inadimplentes' })
  const sheet = workbook.Sheets.Inadimplentes
  if (!sheet) throw new Error('O XLSX não contém a aba Inadimplentes da Lello.')
  const campos = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1 }).slice(0, 8).flat()
    .filter((v): v is string => typeof v === 'string').map(v => v.trim())
  const identificador = campos.flatMap(v => {
    const match = /^(\d+)\s*-\s*(.+)$/.exec(v)
    return match && Number(match[1]) === Number(codigo) ? [normalizar(match[2])] : []
  })
  if (!campos.some(v => normalizar(v) === 'COTAS ATRASADAS') || !identificador.includes(normalizar(condominio))) {
    throw new Error('O relatório pertence a outro condomínio ou tem outro formato.')
  }
  if (!campos.some(v => normalizar(v) === `${periodo.de} ATE ${periodo.ate}`)) {
    throw new Error('O período do relatório diverge do período do pedido.')
  }
}

export async function anexarRelatorioWork(
  db: SupabaseClient,
  entrega: NonNullable<Awaited<ReturnType<typeof carregarEntregaWork>>>,
  arquivo: File,
) {
  if (arquivo.size < 1 || arquivo.size > LIMITE_RELATORIO_WORK) throw new Error('O XLSX deve ter até 4 MB.')
  const bytes = Buffer.from(await arquivo.arrayBuffer())
  validarRelatorioWork(bytes, entrega.codigo, entrega.condominio, entrega.periodo)
  const hash = createHash('sha256').update(bytes).digest('hex')
  const path = `${entrega.execucao.id}/${hash}.xlsx`
  const bucket = db.storage.from(BUCKET)
  if (entrega.execucao.status === STATUS_WORK_KEILA) {
    const { data: configuracao, error: erroBucket } = await db.storage.getBucket(BUCKET)
    if (erroBucket || !configuracao || configuracao.public) throw new Error('Armazenamento privado indisponível.')
    const { error } = await bucket.upload(path, bytes, { contentType: 'application/octet-stream', upsert: false })
    if (error) {
      // Se houve reenvio ou timeout de rede, confira a cópia antes de reutilizá-la.
      const anterior = await bucket.download(path)
      if (!anterior.data || createHash('sha256').update(Buffer.from(await anterior.data.arrayBuffer())).digest('hex') !== hash) {
        throw new Error('Não foi possível guardar o relatório no armazenamento privado.')
      }
    }
  }
  const { data, error } = await db.rpc('keila_work_anexar', {
    p_execucao: entrega.execucao.id, p_caso: entrega.casoId, p_nome: 'Cotas_Atrasadas_Lello.xlsx',
    p_tipo: XLSX_MIME, p_sha: hash, p_tamanho: bytes.length,
  })
  if (error || !data) throw new Error('Não foi possível vincular o relatório a este atendimento.')
  return data as string
}
