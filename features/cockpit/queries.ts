import { createClient } from '@/utils/supabase/server'
import { applyCarteiraScope } from '@/utils/auth/apply-carteira-scope'
import type { CarteiraScope } from '@/utils/auth/get-permitted-carteiras'
import { normalizeRelations, normalizeRelationsList } from '@/utils/supabase/normalize-relation'
import { buildAcordoItem, buildCobrancaItem } from './rules'

export async function getCockpitInteligente(scope: CarteiraScope) {
  const supabase = await createClient()

  let acordosQuery = supabase
    .from('acordos')
    .select(`
      id,
      tipo,
      status,
      valor_acordado,
      entrada,
      data_acordo,
      condominios(nome),
      unidades(identificacao, responsavel_nome),
      parcelas_acordo(vencimento, status)
    `)
    .in('status', ['ativo', 'em atraso', 'rompido'])
    .order('data_acordo', { ascending: false })
    .limit(80)

  acordosQuery = applyCarteiraScope(acordosQuery, scope.carteiraIds)

  let cobrancasQuery = supabase
    .from('cobrancas')
    .select(`
      id,
      competencia,
      vencimento,
      valor_atualizado,
      status,
      ultima_interacao_at,
      condominios(nome),
      unidades(identificacao, responsavel_nome)
    `)
    .in('status', ['novo', 'em cobrança ativa', 'em negociação'])
    .order('vencimento', { ascending: true })
    .limit(120)

  cobrancasQuery = applyCarteiraScope(cobrancasQuery, scope.carteiraIds)

  const [
    { data: acordos, error: acordosError },
    { data: cobrancas, error: cobrancasError },
  ] = await Promise.all([acordosQuery, cobrancasQuery])

  if (acordosError) {
    throw new Error(`Erro ao carregar acordos do cockpit: ${acordosError.message}`)
  }

  if (cobrancasError) {
    throw new Error(`Erro ao carregar cobranças do cockpit: ${cobrancasError.message}`)
  }

  const acordosBase = normalizeRelationsList((acordos ?? []) as any[], ['condominios', 'unidades'])
  const cobrancasBase = normalizeRelationsList((cobrancas ?? []) as any[], ['condominios', 'unidades'])

  const acordosNormalizados = acordosBase.map((acordo: any) => {
    const abertas = (acordo.parcelas_acordo ?? [])
      .filter((parcela: any) => parcela.status !== 'paga')
      .sort((a: any, b: any) => String(a.vencimento).localeCompare(String(b.vencimento)))

    return {
      ...acordo,
      proxima_parcela_vencimento: abertas[0]?.vencimento ?? null,
      ultima_interacao_at: acordo.data_acordo,
    }
  })

  const itens = [
    ...acordosNormalizados.map(buildAcordoItem),
    ...cobrancasBase.map(buildCobrancaItem),
  ].sort((a, b) => b.score - a.score)

  const prioridadeHoje = itens.slice(0, 12)
  const criticos = itens.filter((item) => item.prioridade === 'critica')
  const alta = itens.filter((item) => item.prioridade === 'alta')
  const acordosEmRisco = itens.filter(
    (item) => item.tipo === 'acordo' && ['critica', 'alta'].includes(item.prioridade)
  )
  const negociacoesQuentes = itens.filter(
    (item) => item.tipo === 'cobranca' && item.status === 'em negociação'
  )
  const cobrancasComPotencial = itens.filter(
    (item) => item.tipo === 'cobranca' && ['critica', 'alta', 'media'].includes(item.prioridade)
  )

  const dinheiroEmRisco = acordosEmRisco.reduce((sum, item) => sum + item.valor, 0)
  const potencialConversao = negociacoesQuentes.reduce((sum, item) => sum + item.valor, 0)
  const carteiraAcionavel = itens
    .filter((item) => item.acao !== 'Sem ação imediata')
    .reduce((sum, item) => sum + item.valor, 0)

  return {
    itens,
    prioridadeHoje,
    criticos,
    alta,
    acordosEmRisco,
    negociacoesQuentes,
    cobrancasComPotencial,
    metrics: {
      dinheiroEmRisco,
      potencialConversao,
      carteiraAcionavel,
      totalPrioridades: prioridadeHoje.length,
      criticos: criticos.length,
      alta: alta.length,
      acordosEmRisco: acordosEmRisco.length,
      negociacoesQuentes: negociacoesQuentes.length,
    },
  }
}
