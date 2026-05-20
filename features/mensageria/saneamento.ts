import { createClient } from '@/utils/supabase/server'
import { applyCarteiraScope } from '@/utils/auth/apply-carteira-scope'
import type { CarteiraScope } from '@/utils/auth/get-permitted-carteiras'

export type MensageriaSaudeMetric = {
  label: string
  value: number
  description: string
  severity: 'ok' | 'warning' | 'danger' | 'neutral'
}

export type MensageriaSaudeItem = {
  id: string
  tipo: 'mensagem' | 'lote' | 'log'
  titulo: string
  descricao: string
  status?: string | null
  created_at?: string | null
  href?: string
  severity: 'ok' | 'warning' | 'danger' | 'neutral'
}

function safeNumber(value: unknown) {
  const parsed = Number(value ?? 0)
  return Number.isFinite(parsed) ? parsed : 0
}

function countBy<T extends Record<string, unknown>>(rows: T[], field: keyof T) {
  const result = new Map<string, number>()

  for (const row of rows) {
    const key = String(row[field] ?? 'sem_status')
    result.set(key, (result.get(key) ?? 0) + 1)
  }

  return result
}

function olderThanHours(value: string | null | undefined, hours: number) {
  if (!value) return false
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return false
  return Date.now() - date.getTime() > hours * 60 * 60 * 1000
}

export async function getMensageriaSaneamento(scope: CarteiraScope) {
  const supabase = await createClient()

  let mensagensQuery = supabase
    .from('mensagens')
    .select('id,carteira_id,lote_id,lote_item_id,canal,status,status_operacional,tentativas_envio,created_at,ultima_tentativa_em,ultimo_erro,erro,erro_envio')
    .order('created_at', { ascending: false })
    .limit(1000)

  mensagensQuery = applyCarteiraScope(mensagensQuery, scope.carteiraIds)

  let lotesQuery = supabase
    .from('lotes')
    .select('id,carteira_id,tipo,status,total_pendentes,total_aprovadas,total_enviadas,total_erros,total_criadas,total_duplicadas,total_puladas,created_at,finalizado_em')
    .in('tipo', ['regua_cobranca', 'regua_acordo', 'mensageria'])
    .order('created_at', { ascending: false })
    .limit(300)

  lotesQuery = applyCarteiraScope(lotesQuery, scope.carteiraIds)

  let logsQuery = supabase
    .from('mensageria_logs')
    .select('id,carteira_id,lote_id,mensagem_id,evento,status_novo,descricao,created_at')
    .order('created_at', { ascending: false })
    .limit(80)

  logsQuery = applyCarteiraScope(logsQuery, scope.carteiraIds)

  const [mensagensResult, lotesResult, logsResult] = await Promise.all([
    mensagensQuery,
    lotesQuery,
    logsQuery,
  ])

  if (mensagensResult.error) {
    throw new Error(`Erro ao carregar mensagens para saneamento: ${mensagensResult.error.message}`)
  }

  if (lotesResult.error) {
    throw new Error(`Erro ao carregar lotes para saneamento: ${lotesResult.error.message}`)
  }

  if (logsResult.error) {
    throw new Error(`Erro ao carregar logs de mensageria para saneamento: ${logsResult.error.message}`)
  }

  const mensagens = (mensagensResult.data ?? []) as any[]
  const lotes = (lotesResult.data ?? []) as any[]
  const logs = (logsResult.data ?? []) as any[]

  const statusMensagens = countBy(mensagens, 'status')
  const statusOperacional = countBy(mensagens, 'status_operacional')
  const statusLotes = countBy(lotes, 'status')

  const mensagensComFalha = mensagens.filter((row) => row.status === 'falha' || row.status_operacional === 'falha')
  const mensagensPendentesAntigas = mensagens.filter((row) => {
    const status = String(row.status_operacional ?? row.status ?? '')
    return ['rascunho', 'pendente_aprovacao', 'aprovada', 'agendada'].includes(status) && olderThanHours(row.created_at, 72)
  })
  const mensagensSemLoteItem = mensagens.filter((row) => row.lote_id && !row.lote_item_id)
  const aguardandoRetorno = mensagens.filter((row) => row.status_operacional === 'aguardando_retorno')
  const lotesAbertosAntigos = lotes.filter((row) => {
    const status = String(row.status ?? '')
    return ['gerado', 'processando', 'pendente_aprovacao', 'aprovado', 'parcial'].includes(status) && olderThanHours(row.created_at, 72)
  })
  const lotesComErro = lotes.filter((row) => safeNumber(row.total_erros) > 0 || row.status === 'erro' || row.status === 'concluido_com_falhas')

  const metrics: MensageriaSaudeMetric[] = [
    {
      label: 'Mensagens monitoradas',
      value: mensagens.length,
      description: 'Últimas mensagens dentro do escopo de carteira.',
      severity: 'neutral',
    },
    {
      label: 'Pendências antigas',
      value: mensagensPendentesAntigas.length,
      description: 'Mensagens abertas há mais de 72h.',
      severity: mensagensPendentesAntigas.length > 0 ? 'warning' : 'ok',
    },
    {
      label: 'Falhas',
      value: mensagensComFalha.length,
      description: 'Mensagens com erro/falha operacional.',
      severity: mensagensComFalha.length > 0 ? 'danger' : 'ok',
    },
    {
      label: 'Aguardando retorno',
      value: aguardandoRetorno.length,
      description: 'WhatsApps marcados para acompanhamento.',
      severity: aguardandoRetorno.length > 0 ? 'warning' : 'ok',
    },
    {
      label: 'Mensagens sem item',
      value: mensagensSemLoteItem.length,
      description: 'Mensagens com lote, mas sem lote_item_id vinculado.',
      severity: mensagensSemLoteItem.length > 0 ? 'warning' : 'ok',
    },
    {
      label: 'Lotes abertos antigos',
      value: lotesAbertosAntigos.length,
      description: 'Lotes abertos há mais de 72h.',
      severity: lotesAbertosAntigos.length > 0 ? 'warning' : 'ok',
    },
  ]

  const items: MensageriaSaudeItem[] = [
    ...mensagensComFalha.slice(0, 20).map((row) => ({
      id: row.id,
      tipo: 'mensagem' as const,
      titulo: `Mensagem com falha · ${row.canal ?? 'canal não informado'}`,
      descricao: row.ultimo_erro ?? row.erro_envio ?? row.erro ?? 'Falha sem detalhe registrado.',
      status: row.status_operacional ?? row.status,
      created_at: row.ultima_tentativa_em ?? row.created_at,
      href: row.lote_id ? `/app/lotes/${row.lote_id}` : '/app/mensageria',
      severity: 'danger' as const,
    })),
    ...mensagensPendentesAntigas.slice(0, 20).map((row) => ({
      id: row.id,
      tipo: 'mensagem' as const,
      titulo: `Mensagem pendente antiga · ${row.canal ?? 'canal não informado'}`,
      descricao: 'Mensagem criada há mais de 72h ainda não finalizada.',
      status: row.status_operacional ?? row.status,
      created_at: row.created_at,
      href: row.lote_id ? `/app/lotes/${row.lote_id}` : '/app/mensageria',
      severity: 'warning' as const,
    })),
    ...lotesAbertosAntigos.slice(0, 20).map((row) => ({
      id: row.id,
      tipo: 'lote' as const,
      titulo: `Lote aberto antigo · ${row.tipo ?? 'mensageria'}`,
      descricao: 'Lote criado há mais de 72h ainda exige fechamento operacional.',
      status: row.status,
      created_at: row.created_at,
      href: `/app/lotes/${row.id}`,
      severity: 'warning' as const,
    })),
    ...lotesComErro.slice(0, 20).map((row) => ({
      id: row.id,
      tipo: 'lote' as const,
      titulo: `Lote com erro · ${row.tipo ?? 'mensageria'}`,
      descricao: `${safeNumber(row.total_erros)} erro(s) registrados no processamento/envio.`,
      status: row.status,
      created_at: row.created_at,
      href: `/app/lotes/${row.id}`,
      severity: 'danger' as const,
    })),
  ].slice(0, 50)

  return {
    metrics,
    items,
    statusMensagens: Object.fromEntries(statusMensagens),
    statusOperacional: Object.fromEntries(statusOperacional),
    statusLotes: Object.fromEntries(statusLotes),
    logs,
    generatedAt: new Date().toISOString(),
  }
}
