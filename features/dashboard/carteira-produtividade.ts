import { createClient } from '@/utils/supabase/server'
import { applyCarteiraScope } from '@/utils/auth/apply-carteira-scope'
import type { CarteiraScope } from '@/utils/auth/get-permitted-carteiras'

export type CarteiraCockpitItem = {
  carteiraId: string
  carteiraNome: string
  totalCobrancas: number
  cobrancasAbertas: number
  emNegociacao: number
  judicializadas: number
  suspensas: number
  valorEmAberto: number
  totalAcordos: number
  acordosAtivos: number
  acordosEmRisco: number
  valorRecuperado: number
  mensagensEnviadas: number
  mensagensFalha: number
  lotesAtivos: number
  atrasoMedioDias: number
  eficiencia: number
  aging: {
    ate30: number
    de31a60: number
    de61a90: number
    acima90: number
  }
}

export type OperadorProdutividadeItem = {
  operadorId: string | null
  nome: string
  email?: string | null
  totalCobrancas: number
  contatos: number
  negociacoes: number
  acordos: number
  efetivados: number
  mensagensEnviadas: number
  valorCarteira: number
  valorRecuperado: number
  eficiencia: number
}

export type CarteiraProdutividadeData = {
  carteiras: CarteiraCockpitItem[]
  operadores: OperadorProdutividadeItem[]
  resumo: {
    totalCarteiras: number
    totalCobrancas: number
    valorEmAberto: number
    valorRecuperado: number
    mensagensEnviadas: number
    eficienciaMedia: number
  }
  alertas: Array<{
    titulo: string
    descricao: string
    tone: 'info' | 'success' | 'warning' | 'danger'
  }>
}

type CarteiraRow = {
  id: string
  nome: string | null
}

type ProfileRow = {
  id: string
  nome: string | null
  email: string | null
}

type CobrancaRow = {
  id: string
  carteira_id: string
  operador_id: string | null
  status_operacional: string | null
  status_financeiro: string | null
  valor_original: number | string | null
  valor_atualizado: number | string | null
  vencimento: string | null
  ultima_interacao_at: string | null
  created_at: string | null
}

type AcordoRow = {
  id: string
  carteira_id: string
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
  status: string | null
  status_operacional: string | null
  canal: string | null
  created_at: string | null
  enviada_manual_por: string | null
}

type LoteRow = {
  id: string
  carteira_id: string
  tipo: string | null
  status: string | null
  total_pendentes: number | null
  total_aprovadas: number | null
  total_enviadas: number | null
  total_erros: number | null
  created_at: string | null
}

function money(value: unknown) {
  return Number(value ?? 0) || 0
}

function normalize(value: unknown) {
  return String(value ?? '').trim().toLowerCase().replace(/\s+/g, '_')
}

function pct(part: number, total: number) {
  if (!total) return 0
  return Math.round((part / total) * 100)
}

function daysLate(vencimento: string | null) {
  if (!vencimento) return 0
  const date = new Date(vencimento)
  if (Number.isNaN(date.getTime())) return 0
  return Math.max(0, Math.floor((Date.now() - date.getTime()) / 86_400_000))
}

function avg(values: number[]) {
  if (values.length === 0) return 0
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length)
}

function isOpenCobranca(row: CobrancaRow) {
  const statusFinanceiro = normalize(row.status_financeiro)
  const statusOperacional = normalize(row.status_operacional)

  return (
    statusFinanceiro !== 'quitado' &&
    !['acordo_efetivado', 'suspenso'].includes(statusOperacional)
  )
}

function isMensagemEnviada(row: MensagemRow) {
  return normalize(row.status) === 'enviada' || normalize(row.status_operacional) === 'enviada'
}

function isMensagemFalha(row: MensagemRow) {
  return normalize(row.status) === 'falha' || normalize(row.status_operacional) === 'falha'
}

function isAcordoAtivo(row: AcordoRow) {
  return ['ativo', 'em_dia'].includes(normalize(row.status))
}

function isAcordoRisco(row: AcordoRow) {
  return ['em_atraso', 'vencido'].includes(normalize(row.status))
}

function isAcordoRecuperado(row: AcordoRow) {
  return normalize(row.status) === 'quitado' || normalize(row.status_financeiro) === 'quitado'
}

function buildEmpty(message: string): CarteiraProdutividadeData {
  return {
    carteiras: [],
    operadores: [],
    resumo: {
      totalCarteiras: 0,
      totalCobrancas: 0,
      valorEmAberto: 0,
      valorRecuperado: 0,
      mensagensEnviadas: 0,
      eficienciaMedia: 0,
    },
    alertas: [
      {
        titulo: 'Sem dados para gestão',
        descricao: message,
        tone: 'warning',
      },
    ],
  }
}

export async function getCarteiraProdutividadeData(
  scope: CarteiraScope,
): Promise<CarteiraProdutividadeData> {
  if (scope.carteiraIds !== null && scope.carteiraIds.length === 0) {
    return buildEmpty('Seu usuário não possui carteiras vinculadas para montar o cockpit de gestão.')
  }

  const supabase = await createClient()

  let carteirasQuery = supabase.from('carteiras').select('id, nome').order('nome')
  if (scope.carteiraIds !== null) {
    carteirasQuery = carteirasQuery.in('id', scope.carteiraIds)
  }

  let cobrancasQuery = supabase
    .from('cobrancas')
    .select(
      'id, carteira_id, operador_id, status_operacional, status_financeiro, valor_original, valor_atualizado, vencimento, ultima_interacao_at, created_at',
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
    .select('id, carteira_id, cobranca_id, status, status_operacional, canal, created_at, enviada_manual_por')
    .order('created_at', { ascending: false })
  mensagensQuery = applyCarteiraScope(mensagensQuery, scope.carteiraIds)

  let lotesQuery = supabase
    .from('lotes')
    .select('id, carteira_id, tipo, status, total_pendentes, total_aprovadas, total_enviadas, total_erros, created_at')
    .order('created_at', { ascending: false })
  lotesQuery = applyCarteiraScope(lotesQuery, scope.carteiraIds)

  const [carteirasResult, cobrancasResult, acordosResult, mensagensResult, lotesResult, profilesResult] =
    await Promise.all([
      carteirasQuery,
      cobrancasQuery,
      acordosQuery,
      mensagensQuery,
      lotesQuery,
      supabase.from('profiles').select('id, nome, email'),
    ])

  if (carteirasResult.error) throw new Error(`Erro ao carregar carteiras: ${carteirasResult.error.message}`)
  if (cobrancasResult.error) throw new Error(`Erro ao carregar cobranças: ${cobrancasResult.error.message}`)
  if (acordosResult.error) throw new Error(`Erro ao carregar acordos: ${acordosResult.error.message}`)
  if (mensagensResult.error) throw new Error(`Erro ao carregar mensagens: ${mensagensResult.error.message}`)
  if (lotesResult.error) throw new Error(`Erro ao carregar lotes: ${lotesResult.error.message}`)

  const carteiras = (carteirasResult.data ?? []) as CarteiraRow[]
  const cobrancas = (cobrancasResult.data ?? []) as CobrancaRow[]
  const acordos = (acordosResult.data ?? []) as AcordoRow[]
  const mensagens = (mensagensResult.data ?? []) as MensagemRow[]
  const lotes = (lotesResult.data ?? []) as LoteRow[]
  const profiles = ((profilesResult.data ?? []) as ProfileRow[]) ?? []

  const carteiraNome = new Map(carteiras.map((carteira) => [carteira.id, carteira.nome ?? 'Carteira']))
  const cobrancaById = new Map(cobrancas.map((cobranca) => [cobranca.id, cobranca]))
  const profileById = new Map(profiles.map((profile) => [profile.id, profile]))

  const carteirasData = carteiras.map((carteira) => {
    const cobrancasCarteira = cobrancas.filter((row) => row.carteira_id === carteira.id)
    const acordosCarteira = acordos.filter((row) => row.carteira_id === carteira.id)
    const mensagensCarteira = mensagens.filter((row) => row.carteira_id === carteira.id)
    const lotesCarteira = lotes.filter((row) => row.carteira_id === carteira.id)
    const abertas = cobrancasCarteira.filter(isOpenCobranca)
    const atrasos = abertas.map((row) => daysLate(row.vencimento)).filter((value) => value > 0)
    const valorEmAberto = abertas.reduce((sum, row) => sum + money(row.valor_atualizado ?? row.valor_original), 0)
    const valorRecuperado = acordosCarteira
      .filter(isAcordoRecuperado)
      .reduce((sum, row) => sum + money(row.valor_acordado), 0)
    const mensagensEnviadas = mensagensCarteira.filter(isMensagemEnviada).length
    const mensagensFalha = mensagensCarteira.filter(isMensagemFalha).length
    const lotesAtivos = lotesCarteira.filter((row) =>
      ['gerado', 'pendente_aprovacao', 'aprovado', 'processando', 'parcial'].includes(normalize(row.status)),
    ).length
    const totalCobrancas = cobrancasCarteira.length
    const acordosAtivos = acordosCarteira.filter(isAcordoAtivo).length
    const acordosEmRisco = acordosCarteira.filter(isAcordoRisco).length
    const eficiencia = Math.round(
      pct(mensagensEnviadas, Math.max(totalCobrancas, 1)) * 0.25 +
        pct(acordosAtivos + acordosEmRisco, Math.max(totalCobrancas, 1)) * 0.35 +
        pct(valorRecuperado, Math.max(valorEmAberto + valorRecuperado, 1)) * 0.4,
    )

    return {
      carteiraId: carteira.id,
      carteiraNome: carteiraNome.get(carteira.id) ?? 'Carteira',
      totalCobrancas,
      cobrancasAbertas: abertas.length,
      emNegociacao: cobrancasCarteira.filter((row) => normalize(row.status_operacional) === 'em_negociacao').length,
      judicializadas: cobrancasCarteira.filter((row) => normalize(row.status_operacional) === 'judicializado').length,
      suspensas: cobrancasCarteira.filter((row) => normalize(row.status_operacional) === 'suspenso').length,
      valorEmAberto,
      totalAcordos: acordosCarteira.length,
      acordosAtivos,
      acordosEmRisco,
      valorRecuperado,
      mensagensEnviadas,
      mensagensFalha,
      lotesAtivos,
      atrasoMedioDias: avg(atrasos),
      eficiencia,
      aging: {
        ate30: abertas.filter((row) => daysLate(row.vencimento) <= 30).length,
        de31a60: abertas.filter((row) => daysLate(row.vencimento) >= 31 && daysLate(row.vencimento) <= 60).length,
        de61a90: abertas.filter((row) => daysLate(row.vencimento) >= 61 && daysLate(row.vencimento) <= 90).length,
        acima90: abertas.filter((row) => daysLate(row.vencimento) > 90).length,
      },
    } satisfies CarteiraCockpitItem
  })

  const operatorMap = new Map<string, OperadorProdutividadeItem>()

  for (const cobranca of cobrancas) {
    const key = cobranca.operador_id ?? 'sem-operador'
    const profile = cobranca.operador_id ? profileById.get(cobranca.operador_id) : null
    const current = operatorMap.get(key) ?? {
      operadorId: cobranca.operador_id,
      nome: profile?.nome ?? profile?.email ?? (cobranca.operador_id ? `Operador ${cobranca.operador_id.slice(0, 8)}` : 'Sem operador'),
      email: profile?.email ?? null,
      totalCobrancas: 0,
      contatos: 0,
      negociacoes: 0,
      acordos: 0,
      efetivados: 0,
      mensagensEnviadas: 0,
      valorCarteira: 0,
      valorRecuperado: 0,
      eficiencia: 0,
    }

    current.totalCobrancas += 1
    current.valorCarteira += money(cobranca.valor_atualizado ?? cobranca.valor_original)

    const status = normalize(cobranca.status_operacional)
    if (cobranca.ultima_interacao_at || ['em_cobranca_ativa', 'em_negociacao', 'acordo_firmado', 'acordo_efetivado'].includes(status)) current.contatos += 1
    if (['em_negociacao', 'acordo_firmado', 'acordo_efetivado'].includes(status)) current.negociacoes += 1
    if (['acordo_firmado', 'acordo_efetivado'].includes(status)) current.acordos += 1
    if (status === 'acordo_efetivado') current.efetivados += 1

    operatorMap.set(key, current)
  }

  for (const mensagem of mensagens) {
    if (!isMensagemEnviada(mensagem)) continue
    const cobranca = mensagem.cobranca_id ? cobrancaById.get(mensagem.cobranca_id) : null
    const key = mensagem.enviada_manual_por ?? cobranca?.operador_id ?? 'sem-operador'
    const profile = key !== 'sem-operador' ? profileById.get(key) : null
    const current = operatorMap.get(key) ?? {
      operadorId: key === 'sem-operador' ? null : key,
      nome: profile?.nome ?? profile?.email ?? (key === 'sem-operador' ? 'Sem operador' : `Operador ${key.slice(0, 8)}`),
      email: profile?.email ?? null,
      totalCobrancas: 0,
      contatos: 0,
      negociacoes: 0,
      acordos: 0,
      efetivados: 0,
      mensagensEnviadas: 0,
      valorCarteira: 0,
      valorRecuperado: 0,
      eficiencia: 0,
    }
    current.mensagensEnviadas += 1
    operatorMap.set(key, current)
  }

  for (const acordo of acordos) {
    const cobranca = acordo.cobranca_id ? cobrancaById.get(acordo.cobranca_id) : null
    const key = cobranca?.operador_id ?? 'sem-operador'
    const current = operatorMap.get(key)
    if (!current) continue
    current.acordos += isAcordoAtivo(acordo) || isAcordoRisco(acordo) || isAcordoRecuperado(acordo) ? 1 : 0
    if (isAcordoRecuperado(acordo)) {
      current.efetivados += 1
      current.valorRecuperado += money(acordo.valor_acordado)
    }
  }

  const operadores = Array.from(operatorMap.values())
    .map((operador) => ({
      ...operador,
      eficiencia: Math.round(
        pct(operador.contatos, operador.totalCobrancas) * 0.25 +
          pct(operador.negociacoes, operador.contatos) * 0.25 +
          pct(operador.acordos, operador.negociacoes || operador.totalCobrancas) * 0.25 +
          pct(operador.efetivados, operador.acordos) * 0.25,
      ),
    }))
    .sort((a, b) => b.eficiencia - a.eficiencia)

  const resumo = {
    totalCarteiras: carteirasData.length,
    totalCobrancas: carteirasData.reduce((sum, item) => sum + item.totalCobrancas, 0),
    valorEmAberto: carteirasData.reduce((sum, item) => sum + item.valorEmAberto, 0),
    valorRecuperado: carteirasData.reduce((sum, item) => sum + item.valorRecuperado, 0),
    mensagensEnviadas: carteirasData.reduce((sum, item) => sum + item.mensagensEnviadas, 0),
    eficienciaMedia: avg(carteirasData.map((item) => item.eficiencia)),
  }

  const alertas: CarteiraProdutividadeData['alertas'] = []
  const carteiraCritica = [...carteirasData].sort((a, b) => b.acordosEmRisco - a.acordosEmRisco)[0]
  if (carteiraCritica && carteiraCritica.acordosEmRisco > 0) {
    alertas.push({
      titulo: 'Acordos em risco',
      descricao: `${carteiraCritica.carteiraNome} concentra ${carteiraCritica.acordosEmRisco} acordo(s) em atraso/vencido.`,
      tone: 'warning',
    })
  }

  const carteiraAging = [...carteirasData].sort((a, b) => b.aging.acima90 - a.aging.acima90)[0]
  if (carteiraAging && carteiraAging.aging.acima90 > 0) {
    alertas.push({
      titulo: 'Aging crítico',
      descricao: `${carteiraAging.carteiraNome} tem ${carteiraAging.aging.acima90} cobrança(s) acima de 90 dias.`,
      tone: 'danger',
    })
  }

  if (resumo.eficienciaMedia >= 65) {
    alertas.push({
      titulo: 'Operação saudável',
      descricao: 'A eficiência média das carteiras está em patamar operacional bom.',
      tone: 'success',
    })
  }

  return {
    carteiras: carteirasData.sort((a, b) => b.valorEmAberto - a.valorEmAberto),
    operadores,
    resumo,
    alertas,
  }
}
