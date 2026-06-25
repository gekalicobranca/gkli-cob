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
  acao?: string
  status?: string | null
  created_at?: string | null
  href?: string
  severity: 'ok' | 'warning' | 'danger' | 'neutral'
}

function safeNumber(value: unknown) {
  const parsed = Number(value ?? 0)
  return Number.isFinite(parsed) ? parsed : 0
}

function statusKey(value: unknown) {
  return String(value ?? 'sem_status').trim() || 'sem_status'
}

function countBy<T extends Record<string, unknown>>(rows: T[], field: keyof T) {
  const result = new Map<string, number>()

  for (const row of rows) {
    const key = statusKey(row[field])
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

function groupByLote(rows: any[]) {
  const result = new Map<string, any[]>()

  for (const row of rows) {
    const loteId = row.lote_id as string | null
    if (!loteId) continue
    const group = result.get(loteId) ?? []
    group.push(row)
    result.set(loteId, group)
  }

  return result
}

function loteCounterDiff(lote: any, itens: any[]) {
  const totalPuladas = itens.filter((row) => row.status === 'pulada').length
  const totalDuplicadas = itens.filter((row) => row.status === 'duplicada').length
  const totalErros = itens.filter((row) => row.status === 'erro').length
  const totalCriadas = itens.filter((row) => row.mensagem_id && row.status !== 'duplicada').length
  const diffs: string[] = []

  if (safeNumber(lote.total_criadas) !== totalCriadas) diffs.push(`criadas ${safeNumber(lote.total_criadas)} -> ${totalCriadas}`)
  if (safeNumber(lote.total_puladas) !== totalPuladas) diffs.push(`puladas ${safeNumber(lote.total_puladas)} -> ${totalPuladas}`)
  if (safeNumber(lote.total_duplicadas) !== totalDuplicadas) diffs.push(`duplicadas ${safeNumber(lote.total_duplicadas)} -> ${totalDuplicadas}`)
  if (safeNumber(lote.total_erros) !== totalErros) diffs.push(`erros ${safeNumber(lote.total_erros)} -> ${totalErros}`)

  return diffs
}

export async function getMensageriaSaneamento(scope: CarteiraScope) {
  const supabase = await createClient()

  let mensagensQuery = supabase
    .from('mensagens')
    .select('id,carteira_id,lote_id,lote_item_id,canal,destinatario,status,status_operacional,tentativas_envio,created_at,ultima_tentativa_em,ultimo_erro,erro,erro_envio')
    .order('created_at', { ascending: false })
    .limit(1500)

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
    .select('id,carteira_id,lote_id,lote_item_id,mensagem_id,evento,status_novo,descricao,created_at')
    .order('created_at', { ascending: false })
    .limit(200)

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
  const loteIds = lotes.map((row) => row.id).filter(Boolean)
  const itensResult = loteIds.length > 0
    ? await supabase
      .from('lote_itens')
      .select('id,lote_id,mensagem_id,status,motivo,created_at')
      .in('lote_id', loteIds)
      .limit(5000)
    : { data: [], error: null }

  if (itensResult.error) {
    throw new Error(`Erro ao carregar itens de lote para saneamento: ${itensResult.error.message}`)
  }

  const loteItens = (itensResult.data ?? []) as any[]
  const itensPorLote = groupByLote(loteItens)

  const statusMensagens = countBy(mensagens, 'status')
  const statusOperacional = countBy(mensagens, 'status_operacional')
  const statusLotes = countBy(lotes, 'status')
  const mensagensComFalha = mensagens.filter((row) => row.status === 'falha' || row.status_operacional === 'falha')
  const mensagensPendentesAntigas = mensagens.filter((row) => {
    const status = statusKey(row.status_operacional ?? row.status)
    return ['rascunho', 'pendente_aprovacao', 'aprovada', 'agendada'].includes(status) && olderThanHours(row.created_at, 72)
  })
  const mensagensSemLoteItem = mensagens.filter((row) => row.lote_id && !row.lote_item_id)
  const mensagensSemDestinatario = mensagens.filter((row) => {
    const status = statusKey(row.status_operacional ?? row.status)
    return ['rascunho', 'pendente_aprovacao', 'aprovada', 'agendada'].includes(status) && !String(row.destinatario ?? '').trim()
  })
  const itensSemMensagem = loteItens.filter((row) =>
    ['criado', 'aprovado', 'enviado'].includes(statusKey(row.status)) && !row.mensagem_id,
  )
  const aguardandoRetorno = mensagens.filter((row) => row.status_operacional === 'aguardando_retorno')
  const lotesAbertosAntigos = lotes.filter((row) => {
    const status = statusKey(row.status)
    return ['gerado', 'processando', 'pendente_aprovacao', 'aprovado', 'parcial'].includes(status) && olderThanHours(row.created_at, 72)
  })
  const lotesComErro = lotes.filter((row) => safeNumber(row.total_erros) > 0 || row.status === 'erro' || row.status === 'concluido_com_falhas')
  const lotesComContadoresDivergentes = lotes
    .map((row) => ({ lote: row, diffs: loteCounterDiff(row, itensPorLote.get(row.id) ?? []) }))
    .filter((row) => row.diffs.length > 0)
  const logsComFalha = logs.filter((row) => String(row.evento ?? '').includes('erro') || String(row.status_novo ?? '') === 'falha')

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
      label: 'Vínculos quebrados',
      value: mensagensSemLoteItem.length + itensSemMensagem.length,
      description: 'Mensagens ou itens sem par operacional.',
      severity: mensagensSemLoteItem.length + itensSemMensagem.length > 0 ? 'warning' : 'ok',
    },
    {
      label: 'Contadores divergentes',
      value: lotesComContadoresDivergentes.length,
      description: 'Lotes com totais diferentes dos itens.',
      severity: lotesComContadoresDivergentes.length > 0 ? 'warning' : 'ok',
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
      acao: 'Abrir o lote, revisar o erro e reprocessar falhas quando fizer sentido.',
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
      acao: 'Aprovar, enviar, cancelar ou registrar retorno para tirar da fila.',
      status: row.status_operacional ?? row.status,
      created_at: row.created_at,
      href: row.lote_id ? `/app/lotes/${row.lote_id}` : '/app/mensageria',
      severity: 'warning' as const,
    })),
    ...mensagensSemLoteItem.slice(0, 20).map((row) => ({
      id: row.id,
      tipo: 'mensagem' as const,
      titulo: `Mensagem sem item de lote · ${row.canal ?? 'canal não informado'}`,
      descricao: 'Mensagem está vinculada a um lote, mas não possui lote_item_id.',
      acao: 'Abrir o lote e conferir se o item correspondente precisa ser vinculado ou recriado.',
      status: row.status_operacional ?? row.status,
      created_at: row.created_at,
      href: row.lote_id ? `/app/lotes/${row.lote_id}` : '/app/mensageria',
      severity: 'warning' as const,
    })),
    ...mensagensSemDestinatario.slice(0, 20).map((row) => ({
      id: row.id,
      tipo: 'mensagem' as const,
      titulo: `Mensagem sem destinatário · ${row.canal ?? 'canal não informado'}`,
      descricao: 'Mensagem aberta não tem destinatário preenchido.',
      acao: 'Editar a mensagem no lote ou corrigir o contato da unidade/responsável antes do envio.',
      status: row.status_operacional ?? row.status,
      created_at: row.created_at,
      href: row.lote_id ? `/app/lotes/${row.lote_id}` : '/app/mensageria',
      severity: 'warning' as const,
    })),
    ...itensSemMensagem.slice(0, 20).map((row) => ({
      id: row.id,
      tipo: 'lote' as const,
      titulo: 'Item de lote sem mensagem',
      descricao: row.motivo ?? 'Item está em status operacional que deveria possuir mensagem vinculada.',
      acao: 'Abrir o lote e recriar/cancelar o item antes de aprovar o lote.',
      status: row.status,
      created_at: row.created_at,
      href: row.lote_id ? `/app/lotes/${row.lote_id}` : '/app/mensageria',
      severity: 'warning' as const,
    })),
    ...lotesAbertosAntigos.slice(0, 20).map((row) => ({
      id: row.id,
      tipo: 'lote' as const,
      titulo: `Lote aberto antigo · ${row.tipo ?? 'mensageria'}`,
      descricao: 'Lote criado há mais de 72h ainda exige fechamento operacional.',
      acao: 'Concluir aprovação/envio, cancelar ou registrar retorno dos itens pendentes.',
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
      acao: 'Reprocessar falhas ou cancelar os itens que não devem seguir.',
      status: row.status,
      created_at: row.created_at,
      href: `/app/lotes/${row.id}`,
      severity: 'danger' as const,
    })),
    ...lotesComContadoresDivergentes.slice(0, 20).map(({ lote, diffs }) => ({
      id: lote.id,
      tipo: 'lote' as const,
      titulo: `Contadores divergentes · ${lote.tipo ?? 'mensageria'}`,
      descricao: diffs.join('; '),
      acao: 'Reabrir o lote para recalcular totais ou revisar itens alterados fora do fluxo.',
      status: lote.status,
      created_at: lote.created_at,
      href: `/app/lotes/${lote.id}`,
      severity: 'warning' as const,
    })),
    ...logsComFalha.slice(0, 20).map((row) => ({
      id: row.id,
      tipo: 'log' as const,
      titulo: `Log de falha · ${row.evento ?? 'evento não informado'}`,
      descricao: row.descricao ?? 'Evento de falha registrado sem descrição.',
      acao: 'Abrir o lote associado e conferir se a falha já foi tratada.',
      status: row.status_novo,
      created_at: row.created_at,
      href: row.lote_id ? `/app/lotes/${row.lote_id}` : '/app/mensageria/log',
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
    totals: {
      aguardandoRetorno: aguardandoRetorno.length,
      mensagensSemDestinatario: mensagensSemDestinatario.length,
      itensSemMensagem: itensSemMensagem.length,
      logsComFalha: logsComFalha.length,
    },
    generatedAt: new Date().toISOString(),
  }
}
