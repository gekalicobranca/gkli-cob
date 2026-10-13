import { avaliarReguaImportacao } from './regua-importacao'
import { registrarEventoOperacional } from '@/features/operacional/service'

type Cobranca = Record<string, any>
export type ContextoClassificacaoJudicial = {
  cobrancas: Cobranca[]
  unidadesJudiciais: Map<string, boolean>
}

export function criarContextoClassificacaoJudicial(cobrancas: Cobranca[]): ContextoClassificacaoJudicial {
  return { cobrancas, unidadesJudiciais: new Map() }
}

function chaveUnidade(row: Cobranca) {
  const normalizar = (v: unknown) => String(v ?? '').trim().toUpperCase().replace(/^0+(?=\d)/, '')
  return [row.condominio_id, normalizar(row.bloco), normalizar(row.identificacao || row.unidade || row.unidade_id)].join('|')
}

// O índice é atribuído pelo servidor. Em empate de vencimento, o recibo
// desempata de forma estável; nunca são liberadas duas cobranças da unidade.
export function selecionarMaisRecenteNaRegua(cobrancas: Cobranca[], atual: Cobranca, inicio: number) {
  return cobrancas.map((row, indice) => ({ row, indice }))
    .filter(({ row }) => chaveUnidade(row) === chaveUnidade(atual)
      && /^\d{4}-\d{2}-\d{2}$/.test(String(row.vencimento ?? ''))
      && !avaliarReguaImportacao({ vencimento: row.vencimento, inicioCobrancaDias: inicio }).foraRegua)
    .sort((a, b) => String(b.row.vencimento).localeCompare(String(a.row.vencimento))
      || String(b.row.recibo ?? '').localeCompare(String(a.row.recibo ?? ''), 'pt-BR', { numeric: true })
      || a.indice - b.indice)[0]?.indice ?? -1
}

export async function reclassificarCobrancaJudicialImportada(
  db: { from: (table: string) => any }, id: string | null | undefined,
  status: string, payload: Cobranca, contexto: ContextoClassificacaoJudicial,
) {
  if (!id || contexto.unidadesJudiciais.get(String(payload.unidade_id)) !== true) return false
  const { data: row, error } = await db.from('cobrancas')
    .select('id,carteira_id,condominio_id,unidade_id,status,status_operacional,status_financeiro,automacao_bloqueada,conversao_relatorio_id')
    .eq('id', id).is('duplicada_de_id', null).maybeSingle()
  if (error) throw new Error('Erro ao conferir cobrança existente: ' + error.message)
  if (!row || row.unidade_id !== payload.unidade_id || row.condominio_id !== payload.condominio_id
    || row.status_financeiro !== 'em_aberto' || row.automacao_bloqueada
    || !['novo', 'regular', 'em_cobranca_ativa', 'judicializado'].includes(row.status_operacional)) return false
  const associarConversao = status === 'novo' && payload.conversao_relatorio_id
    && row.conversao_relatorio_id !== payload.conversao_relatorio_id
  if ((row.status_operacional === status && !associarConversao)
    || (status === 'novo' && row.status_operacional === 'em_cobranca_ativa')) return false
  const { data: acordos, error: ae } = await db.from('acordos').select('id')
    .eq('cobranca_id', id).in('status', ['ativo', 'em_dia', 'em_atraso']).limit(1)
  const { data: vinculos, error: ve } = await db.from('acordo_cobrancas')
    .select('acordo:acordos!inner(status)').eq('cobranca_id', id)
    .in('acordo.status', ['ativo', 'em_dia', 'em_atraso']).limit(1)
  if (ae || ve) throw new Error('Erro ao conferir acordos da cobrança existente.')
  if (acordos?.length || vinculos?.length) return false
  const update = { status, status_operacional: status,
    ...(status === 'novo' && payload.conversao_relatorio_id ? { conversao_relatorio_id: payload.conversao_relatorio_id } : {}) }
  const { data: changed, error: ue } = await db.from('cobrancas').update(update)
    .eq('id', id).eq('status', row.status).eq('status_operacional', row.status_operacional).eq('status_financeiro', 'em_aberto')
    .eq('automacao_bloqueada', false).is('duplicada_de_id', null).select('id')
  if (ue || changed?.length !== 1) throw new Error('Cobrança alterada durante a classificação judicial; reavaliar importação.')
  await registrarEventoOperacional(db as any, {
    carteiraId: row.carteira_id, entidadeTipo: 'cobranca', entidadeId: id,
    eventoCodigo: 'cobranca.classificacao_judicial_importacao', titulo: 'Classificação judicial pela importação',
    descricao: 'Mais recente dentro da régua como Novo; anteriores judicializadas; cotas fora do prazo como Regular.',
    antes: { status: row.status, status_operacional: row.status_operacional }, depois: update,
    payload: { condominio_id: row.condominio_id, unidade_id: row.unidade_id, conversao_relatorio_id: payload.conversao_relatorio_id ?? null },
    origem: 'importacao', auditavel: true, required: true,
  })
  return true
}
