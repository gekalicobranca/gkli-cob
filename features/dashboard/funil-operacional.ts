import { createClient } from '@/utils/supabase/server'
import { applyCarteiraScope } from '@/utils/auth/apply-carteira-scope'
import type { CarteiraScope } from '@/utils/auth/get-permitted-carteiras'

export type FunnelStage = {
  key: 'cobranca' | 'contato' | 'negociacao' | 'acordo' | 'efetivado'
  label: string
  description: string
  count: number
  value: number
  conversionFromPrevious: number
  conversionFromStart: number
}

export type FunnelCarteira = {
  carteiraId: string | null
  carteiraNome: string
  total: number
  valor: number
  contato: number
  negociacao: number
  acordo: number
  efetivado: number
  taxaContato: number
  taxaNegociacao: number
  taxaAcordo: number
  taxaEfetivacao: number
}

export type FunnelOperator = {
  operadorId: string | null
  nome: string
  total: number
  contato: number
  negociacao: number
  acordo: number
  efetivado: number
  eficiencia: number
}

export type FunnelInsight = {
  tone: 'info' | 'success' | 'warning' | 'danger'
  title: string
  description: string
}

export type FunilOperacionalData = {
  stages: FunnelStage[]
  carteiras: FunnelCarteira[]
  operadores: FunnelOperator[]
  insights: FunnelInsight[]
  totals: {
    totalCobrancas: number
    valorTotal: number
    taxaContato: number
    taxaNegociacao: number
    taxaAcordo: number
    taxaEfetivacao: number
  }
}

type CobrancaRow = {
  id: string
  carteira_id: string | null
  operador_id: string | null
  status_operacional: string | null
  status_financeiro: string | null
  valor_original: number | string | null
  valor_atualizado: number | string | null
  created_at: string | null
  vencimento: string | null
  ultima_interacao_at: string | null
}

type AcordoRow = {
  id: string
  carteira_id: string | null
  cobranca_id: string | null
  status: string | null
  status_financeiro: string | null
  valor_acordado: number | string | null
  created_at: string | null
}

type MensagemRow = {
  id: string
  carteira_id: string | null
  cobranca_id: string | null
  acordo_id: string | null
  status: string | null
  status_operacional: string | null
  created_at: string | null
}

type CarteiraRow = {
  id: string
  nome: string | null
}

function money(value: unknown) {
  return Number(value ?? 0) || 0
}

function normalize(value: unknown) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
}

function pct(part: number, total: number) {
  if (!total) return 0
  return Math.round((part / total) * 100)
}

function sumValues(rows: CobrancaRow[]) {
  return rows.reduce(
    (sum, row) => sum + money(row.valor_atualizado ?? row.valor_original),
    0,
  )
}

function stageValue(rows: CobrancaRow[], ids: Set<string>) {
  return rows
    .filter((row) => ids.has(row.id))
    .reduce((sum, row) => sum + money(row.valor_atualizado ?? row.valor_original), 0)
}

function buildInsight(
  tone: FunnelInsight['tone'],
  title: string,
  description: string,
): FunnelInsight {
  return { tone, title, description }
}

export async function getFunilOperacionalPremium(
  scope: CarteiraScope,
): Promise<FunilOperacionalData> {
  const supabase = await createClient()

  let cobrancasQuery = supabase
    .from('cobrancas')
    .select(
      'id, carteira_id, operador_id, status_operacional, status_financeiro, valor_original, valor_atualizado, created_at, vencimento, ultima_interacao_at',
    )
    .order('created_at', { ascending: false })

  cobrancasQuery = applyCarteiraScope(cobrancasQuery, scope.carteiraIds)

  let acordosQuery = supabase
    .from('acordos')
    .select('id, carteira_id, cobranca_id, status, status_financeiro, valor_acordado, created_at')
    .order('created_at', { ascending: false })

  acordosQuery = applyCarteiraScope(acordosQuery, scope.carteiraIds)

  let mensagensQuery = supabase
    .from('mensagens')
    .select('id, carteira_id, cobranca_id, acordo_id, status, status_operacional, created_at')
    .order('created_at', { ascending: false })

  mensagensQuery = applyCarteiraScope(mensagensQuery, scope.carteiraIds)

  let carteirasQuery = supabase
    .from('carteiras')
    .select('id, nome')
    .order('nome', { ascending: true })

  if (scope.carteiraIds !== null) {
    if (scope.carteiraIds.length === 0) {
      return {
        stages: [],
        carteiras: [],
        operadores: [],
        insights: [
          buildInsight(
            'warning',
            'Sem carteiras vinculadas',
            'Seu usuário não possui carteiras vinculadas para montar o funil operacional.',
          ),
        ],
        totals: {
          totalCobrancas: 0,
          valorTotal: 0,
          taxaContato: 0,
          taxaNegociacao: 0,
          taxaAcordo: 0,
          taxaEfetivacao: 0,
        },
      }
    }

    carteirasQuery = carteirasQuery.in('id', scope.carteiraIds)
  }

  const [cobrancasResult, acordosResult, mensagensResult, carteirasResult] =
    await Promise.all([
      cobrancasQuery,
      acordosQuery,
      mensagensQuery,
      carteirasQuery,
    ])

  if (cobrancasResult.error) {
    throw new Error(
      `Erro ao carregar funil/cobranças: ${cobrancasResult.error.message}`,
    )
  }

  if (acordosResult.error) {
    throw new Error(
      `Erro ao carregar funil/acordos: ${acordosResult.error.message}`,
    )
  }

  if (mensagensResult.error) {
    throw new Error(
      `Erro ao carregar funil/mensagens: ${mensagensResult.error.message}`,
    )
  }

  const cobrancas = (cobrancasResult.data ?? []) as CobrancaRow[]
  const acordos = (acordosResult.data ?? []) as AcordoRow[]
  const mensagens = (mensagensResult.data ?? []) as MensagemRow[]
  const carteiras = (carteirasResult.data ?? []) as CarteiraRow[]

  const carteiraNomeById = new Map(
    carteiras.map((carteira) => [carteira.id, carteira.nome ?? 'Carteira']),
  )

  const contatoIds = new Set<string>()
  for (const mensagem of mensagens) {
    if (mensagem.cobranca_id) contatoIds.add(mensagem.cobranca_id)
  }

  for (const cobranca of cobrancas) {
    const status = normalize(cobranca.status_operacional)
    if (
      cobranca.ultima_interacao_at ||
      ['em_cobranca_ativa', 'em_negociacao', 'acordo_firmado', 'acordo_efetivado'].includes(status)
    ) {
      contatoIds.add(cobranca.id)
    }
  }

  const negociacaoIds = new Set(
    cobrancas
      .filter((cobranca) =>
        ['em_negociacao', 'acordo_firmado', 'acordo_efetivado'].includes(
          normalize(cobranca.status_operacional),
        ),
      )
      .map((cobranca) => cobranca.id),
  )

  const acordoIds = new Set<string>()
  const efetivadoIds = new Set<string>()

  for (const acordo of acordos) {
    if (acordo.cobranca_id) {
      acordoIds.add(acordo.cobranca_id)
      negociacaoIds.add(acordo.cobranca_id)
      contatoIds.add(acordo.cobranca_id)

      if (
        normalize(acordo.status) === 'quitado' ||
        normalize(acordo.status_financeiro) === 'quitado'
      ) {
        efetivadoIds.add(acordo.cobranca_id)
      }
    }
  }

  for (const cobranca of cobrancas) {
    const status = normalize(cobranca.status_operacional)

    if (['acordo_firmado', 'acordo_efetivado'].includes(status)) {
      acordoIds.add(cobranca.id)
    }

    if (status === 'acordo_efetivado') {
      efetivadoIds.add(cobranca.id)
    }
  }

  const total = cobrancas.length
  const totalValue = sumValues(cobrancas)

  const stageSpecs: Array<{
    key: FunnelStage['key']
    label: string
    description: string
    count: number
    value: number
  }> = [
    {
      key: 'cobranca',
      label: 'Cobranças',
      description: 'Casos registrados e elegíveis para recuperação.',
      count: total,
      value: totalValue,
    },
    {
      key: 'contato',
      label: 'Contato',
      description: 'Cobranças com mensagem, interação ou início de cobrança.',
      count: contatoIds.size,
      value: stageValue(cobrancas, contatoIds),
    },
    {
      key: 'negociacao',
      label: 'Negociação',
      description: 'Casos em negociação ou que já avançaram para acordo.',
      count: negociacaoIds.size,
      value: stageValue(cobrancas, negociacaoIds),
    },
    {
      key: 'acordo',
      label: 'Acordo',
      description: 'Cobranças com acordo firmado ou acordo vinculado.',
      count: acordoIds.size,
      value: stageValue(cobrancas, acordoIds),
    },
    {
      key: 'efetivado',
      label: 'Efetivado',
      description: 'Cobranças com acordo efetivado ou acordo quitado.',
      count: efetivadoIds.size,
      value: stageValue(cobrancas, efetivadoIds),
    },
  ]

  const stages: FunnelStage[] = stageSpecs.map((stage, index) => {
    const previous = index === 0 ? stage.count : stageSpecs[index - 1]?.count ?? 0
    return {
      ...stage,
      conversionFromPrevious: index === 0 ? 100 : pct(stage.count, previous),
      conversionFromStart: index === 0 ? 100 : pct(stage.count, total),
    }
  })

  const carteiraMap = new Map<string, FunnelCarteira>()

  for (const cobranca of cobrancas) {
    const key = cobranca.carteira_id ?? 'sem-carteira'
    const current = carteiraMap.get(key) ?? {
      carteiraId: cobranca.carteira_id,
      carteiraNome:
        (cobranca.carteira_id ? carteiraNomeById.get(cobranca.carteira_id) : null) ??
        'Sem carteira',
      total: 0,
      valor: 0,
      contato: 0,
      negociacao: 0,
      acordo: 0,
      efetivado: 0,
      taxaContato: 0,
      taxaNegociacao: 0,
      taxaAcordo: 0,
      taxaEfetivacao: 0,
    }

    current.total += 1
    current.valor += money(cobranca.valor_atualizado ?? cobranca.valor_original)
    if (contatoIds.has(cobranca.id)) current.contato += 1
    if (negociacaoIds.has(cobranca.id)) current.negociacao += 1
    if (acordoIds.has(cobranca.id)) current.acordo += 1
    if (efetivadoIds.has(cobranca.id)) current.efetivado += 1

    carteiraMap.set(key, current)
  }

  const carteirasFunnel = Array.from(carteiraMap.values())
    .map((carteira) => ({
      ...carteira,
      taxaContato: pct(carteira.contato, carteira.total),
      taxaNegociacao: pct(carteira.negociacao, carteira.contato),
      taxaAcordo: pct(carteira.acordo, carteira.negociacao),
      taxaEfetivacao: pct(carteira.efetivado, carteira.acordo),
    }))
    .sort((a, b) => b.valor - a.valor)

  const operatorMap = new Map<string, FunnelOperator>()

  for (const cobranca of cobrancas) {
    const key = cobranca.operador_id ?? 'sem-operador'
    const current = operatorMap.get(key) ?? {
      operadorId: cobranca.operador_id,
      nome: cobranca.operador_id ? `Operador ${String(cobranca.operador_id).slice(0, 8)}` : 'Sem operador',
      total: 0,
      contato: 0,
      negociacao: 0,
      acordo: 0,
      efetivado: 0,
      eficiencia: 0,
    }

    current.total += 1
    if (contatoIds.has(cobranca.id)) current.contato += 1
    if (negociacaoIds.has(cobranca.id)) current.negociacao += 1
    if (acordoIds.has(cobranca.id)) current.acordo += 1
    if (efetivadoIds.has(cobranca.id)) current.efetivado += 1

    operatorMap.set(key, current)
  }

  const operadores = Array.from(operatorMap.values())
    .map((operador) => ({
      ...operador,
      eficiencia: Math.round(
        pct(operador.contato, operador.total) * 0.25 +
          pct(operador.negociacao, operador.contato) * 0.25 +
          pct(operador.acordo, operador.negociacao) * 0.3 +
          pct(operador.efetivado, operador.acordo) * 0.2,
      ),
    }))
    .sort((a, b) => b.eficiencia - a.eficiencia)
    .slice(0, 6)

  const taxaContato = stages[1]?.conversionFromStart ?? 0
  const taxaNegociacao = stages[2]?.conversionFromStart ?? 0
  const taxaAcordo = stages[3]?.conversionFromStart ?? 0
  const taxaEfetivacao = stages[4]?.conversionFromStart ?? 0

  const insights: FunnelInsight[] = []

  if (taxaContato < 55) {
    insights.push(
      buildInsight(
        'warning',
        'Contato abaixo do ideal',
        'A régua e a mensageria podem estar deixando uma parte relevante da carteira sem primeiro toque.',
      ),
    )
  } else {
    insights.push(
      buildInsight(
        'success',
        'Boa cobertura de contato',
        'A maior parte da carteira já recebeu algum tipo de acionamento operacional.',
      ),
    )
  }

  if (taxaAcordo < 12 && total > 0) {
    insights.push(
      buildInsight(
        'info',
        'Oportunidade de negociação',
        'Há espaço para transformar contatos e negociações em acordos formais.',
      ),
    )
  }

  if (taxaEfetivacao < 8 && acordoIds.size > 0) {
    insights.push(
      buildInsight(
        'danger',
        'Efetivação exige atenção',
        'Acompanhe entrada e primeira parcela dos acordos para reduzir perda após negociação.',
      ),
    )
  }

  return {
    stages,
    carteiras: carteirasFunnel,
    operadores,
    insights,
    totals: {
      totalCobrancas: total,
      valorTotal: totalValue,
      taxaContato,
      taxaNegociacao,
      taxaAcordo,
      taxaEfetivacao,
    },
  }
}
