import { randomUUID } from 'node:crypto'

export const TAMANHO_LOTE_IMPORTACAO = 15
export const LEASE_IMPORTACAO_MS = 5 * 60_000

export type ResultadoLote = {
  importados: number; criados: number; atualizados: number; divergentes: number
  ausentes: number; ignorados: number; erros: string[]
}
export type ExecucaoImportacao = {
  cursor: number
  total: number
  token: string | null
  lease_ate: string | null
  limpeza: 'dispensada' | 'pendente' | 'iniciada' | 'concluida'
  removidas: number
  resultado: ResultadoLote
}
type SupabaseLike = { from: (table: string) => any }

export function execucaoImportacaoAtiva(execucao: ExecucaoImportacao | null | undefined, now = Date.now()) {
  return Boolean(execucao?.token && execucao.lease_ate && Date.parse(execucao.lease_ate) > now)
}

/** Compare-and-swap: duas confirmações não podem reservar o mesmo lote. */
export async function reservarLoteImportacao(
  supabase: SupabaseLike, id: string, resumo: Record<string, any>, execucao: ExecucaoImportacao,
) {
  if (execucaoImportacaoAtiva(execucao)) throw new Error('Há um lote em processamento. Aguarde e atualize a página.')
  if (execucao.limpeza === 'iniciada') {
    throw new Error('A limpeza anterior foi interrompida. É necessário conferir seu resultado antes de retomar; ela não será repetida automaticamente.')
  }
  const reservada = { ...execucao, token: randomUUID(), lease_ate: new Date(Date.now() + LEASE_IMPORTACAO_MS).toISOString() }
  let query = supabase.from('importacoes')
    .update({ resumo: { ...resumo, execucao_lotes: reservada } })
    .eq('id', id).in('status', ['preview', 'erro'])
  const anterior = resumo.execucao_lotes as ExecucaoImportacao | undefined
  if (anterior) {
    query = query.eq('resumo->execucao_lotes->>cursor', String(anterior.cursor))
    query = anterior.token ? query.eq('resumo->execucao_lotes->>token', anterior.token) : query.is('resumo->execucao_lotes->>token', null)
  } else {
    query = query.is('resumo->execucao_lotes', null)
  }
  const { data, error } = await query.select('id').maybeSingle()
  if (error) throw new Error(`Erro ao reservar lote: ${error.message}`)
  if (!data) throw new Error('Outra confirmação alterou a importação. Atualize a página antes de continuar.')
  return reservada
}

export async function salvarLoteImportacao(
  supabase: SupabaseLike, id: string, resumo: Record<string, any>, execucao: ExecucaoImportacao,
  token = execucao.token,
) {
  const { data, error } = await supabase.from('importacoes')
    .update({ resumo: { ...resumo, execucao_lotes: execucao } })
    .eq('id', id).eq('resumo->execucao_lotes->>token', token)
    .select('id').maybeSingle()
  if (error) throw new Error(`Erro ao salvar progresso: ${error.message}`)
  if (!data) throw new Error('A reserva do lote mudou. Atualize a página antes de retomar.')
}
