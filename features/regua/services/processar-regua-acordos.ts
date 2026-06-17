import { differenceInCalendarDays } from 'date-fns'

import { createAdminClient } from '@/utils/supabase/admin'
import { applyCarteiraScope } from '@/utils/auth/apply-carteira-scope'
import type { CarteiraScope } from '@/utils/auth/get-permitted-carteiras'
import { normalizeRelationsList } from '@/utils/supabase/normalize-relation'
import {
  ACORDO_STATUS_VIGENTES,
  LOTE_ITEM_STATUS,
  LOTE_STATUS,
  LOTE_TIPO,
  MENSAGEM_STATUS,
  PARCELA_ACORDO_STATUS,
} from '@/lib/core/status'
import { formatDateBR, formatMoneyBR, montarMensagem } from '../engine'
import { carregarEtapasDeReguaAdmin, DEFAULT_ACORDO_ETAPAS } from '../queries'
import { avaliarComplianceRegua } from './compliance'
import { verificarSuspensaoRegua } from './suspension'
import { salvarScoreRegua } from './intelligence'
import { resolveTemplateMensagem } from '@/features/mensageria/template-resolver'
import type { ReguaEtapa, ReguaTom } from '../types'
import {
  cicloReferencia,
  criarReguaFingerprint,
  normalizarEtapaId,
  novoContador,
  resumoContadores,
  statusFinalDoLote,
  type ReguaContadores,
} from './regua-shared'

const PAGE_SIZE = 1000

type LoteItemStatus = (typeof LOTE_ITEM_STATUS)[keyof typeof LOTE_ITEM_STATUS]

type ProcessarReguaAcordosParams = {
  scope?: CarteiraScope
  origem?: 'manual' | 'api' | 'cron'
  q?: string
  carteiraId?: string
  condominioId?: string
  contato?: string
}

type Contadores = ReguaContadores

type LoteContext = {
  id: string
  contadores: Contadores
}

export type ResultadoLoteReguaAcordos = {
  loteId: string
  loteIds: string[]
  totalAvaliadas: number
  totalCriadas: number
  totalPuladas: number
  totalDuplicadas: number
  totalErros: number
  itens: Array<{
    acordoId?: string
    parcelaId?: string
    status: LoteItemStatus
    motivo?: string
    mensagemId?: string
  }>
}

function parseDate(value: string | null | undefined) {
  if (!value) return null
  const date = new Date(`${value}T00:00:00`)
  return Number.isNaN(date.getTime()) ? null : date
}

function diasRelativosAoVencimento(vencimento: string | null | undefined, hoje = new Date()) {
  const date = parseDate(vencimento)
  if (!date) return 0
  return differenceInCalendarDays(hoje, date)
}

function normalizeFilter(value?: string | null) {
  return String(value ?? '').trim().toLowerCase()
}

async function fetchAllRows(
  buildQuery: (from: number, to: number) => any,
  errorPrefix: string,
) {
  const rows: any[] = []

  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await buildQuery(from, from + PAGE_SIZE - 1)

    if (error) {
      throw new Error(`${errorPrefix}: ${error.message}`)
    }

    const page = (data ?? []) as any[]
    rows.push(...page)

    if (page.length < PAGE_SIZE) break
  }

  return rows
}

function matchesSearch(row: any, search?: string) {
  const q = normalizeFilter(search)
  if (!q) return true

  const haystack = [
    row.condominios?.nome,
    row.unidades?.identificacao,
    row.unidades?.responsavel_nome,
  ].filter(Boolean).join(' ').toLowerCase()

  return haystack.includes(q)
}

function matchesContato(row: any, contato?: string) {
  const mode = contato || 'todos'
  const hasDestinatario = Boolean(row.unidades?.telefone || row.unidades?.email)

  if (mode === 'com_destinatario') return hasDestinatario
  if (mode === 'sem_destinatario') return !hasDestinatario
  return true
}

function unidadeKey(row: any) {
  return [
    row.condominio_id ?? row.condominios?.id ?? '',
    String(row.unidades?.bloco ?? '').trim().toLowerCase(),
    String(row.unidades?.identificacao ?? '').trim().toLowerCase(),
  ].join('|')
}

function responsavelApoioKey(row: any) {
  return [
    row.condominio_id ?? '',
    String(row.bloco ?? '').trim().toLowerCase(),
    String(row.unidade ?? '').trim().toLowerCase(),
  ].join('|')
}

async function loadResponsaveisApoioMap(
  supabase: ReturnType<typeof createAdminClient>,
  rows: any[],
) {
  const condominioIds = [
    ...new Set(rows.map((row) => row.condominio_id ?? row.condominios?.id).filter(Boolean)),
  ]

  if (!condominioIds.length) return new Map<string, any>()

  const { data, error } = await supabase
    .from('responsaveis_unidades')
    .select('id, condominio_id, unidade, bloco, responsavel_nome, telefone, email, ativo')
    .eq('ativo', true)
    .in('condominio_id', condominioIds)

  if (error) throw new Error(`Erro ao carregar responsÃ¡veis de apoio: ${error.message}`)

  return new Map(((data ?? []) as any[]).map((row) => [responsavelApoioKey(row), row]))
}

function withResponsavelApoio(row: any, apoioMap: Map<string, any>) {
  const apoio = apoioMap.get(unidadeKey(row))
  if (!apoio) return row

  const unidade = row.unidades ?? {}
  return {
    ...row,
    unidades: {
      ...unidade,
      responsavel_nome: apoio.responsavel_nome || unidade.responsavel_nome,
      telefone: apoio.telefone || unidade.telefone,
      email: apoio.email || unidade.email,
    },
  }
}

function selecionarEtapaAcordo(params: {
  etapas: ReguaEtapa[]
  diasRelativos: number
}) {
  return [...params.etapas]
    .filter((etapa) => etapa.ativo !== false)
    .filter((etapa) => params.diasRelativos >= Number(etapa.delay_dias ?? 0))
    .sort((a, b) => Number(b.delay_dias) - Number(a.delay_dias) || Number(b.ordem) - Number(a.ordem))[0]
}

async function criarLote(params: {
  supabase: ReturnType<typeof createAdminClient>
  carteiraId: string
  operadorId?: string | null
  origem?: string
}) {
  const { data: lote, error } = await params.supabase
    .from('lotes')
    .insert({
      carteira_id: params.carteiraId,
      tipo: LOTE_TIPO.REGUA_ACORDO,
      status: LOTE_STATUS.PROCESSANDO,
      operador_id: params.operadorId ?? null,
      observacoes: `Lote gerado pela régua de acordos (${params.origem ?? 'manual'}).`,
      iniciado_em: new Date().toISOString(),
      resumo: { origem: params.origem ?? 'manual', contexto: 'regua_acordo' },
    } as any)
    .select('id')
    .single()

  if (error || !lote?.id) {
    throw new Error(`Erro ao criar lote da régua de acordos: ${error?.message ?? 'lote não retornado'}`)
  }

  return lote.id as string
}

async function criarItemLote(params: {
  supabase: ReturnType<typeof createAdminClient>
  loteId: string
  acordo: any
  parcela?: any
  status: LoteItemStatus
  motivo?: string
  fingerprint?: string
  reguaEtapaId?: string | null
  mensagemId?: string | null
  payload?: Record<string, unknown>
}) {
  const condominio = params.acordo.condominios
  const unidade = params.acordo.unidades

  const { data: item, error } = await params.supabase
    .from('lote_itens')
    .insert({
      lote_id: params.loteId,
      acordo_id: params.acordo.id,
      unidade_id: unidade?.id ?? params.acordo.unidade_id ?? null,
      condominio_id: condominio?.id ?? params.acordo.condominio_id ?? null,
      regua_etapa_id: params.reguaEtapaId ?? null,
      mensagem_id: params.mensagemId ?? null,
      status: params.status,
      motivo: params.motivo ?? null,
      fingerprint: params.fingerprint ?? null,
      payload: params.payload ?? {},
    } as any)
    .select('id')
    .single()

  if (error) throw new Error(`Erro ao criar item do lote de acordo: ${error.message}`)

  return item?.id ?? null
}

async function atualizarLote(params: {
  supabase: ReturnType<typeof createAdminClient>
  loteId: string
  contadores: Contadores
  status?: string
  erro?: string
}) {
  const status = params.status ?? statusFinalDoLote(params.contadores)

  await params.supabase
    .from('lotes')
    .update({
      status,
      total_avaliadas: params.contadores.avaliadas,
      total_criadas: params.contadores.criadas,
      total_puladas: params.contadores.puladas,
      total_duplicadas: params.contadores.duplicadas,
      total_erros: params.contadores.erros,
      resumo: resumoContadores(params.contadores, { contexto: 'regua_acordo', erro: params.erro ?? null }),
      finalizado_em: new Date().toISOString(),
    } as any)
    .eq('id', params.loteId)
}

async function carregarParcelasAbertas(
  supabase: ReturnType<typeof createAdminClient>,
  acordoIds: string[],
) {
  if (!acordoIds.length) return new Map<string, any[]>()

  const { data, error } = await supabase
    .from('parcelas_acordo')
    .select('id, acordo_id, numero, tipo_parcela, valor, vencimento, status')
    .in('acordo_id', acordoIds)
    .in('status', [PARCELA_ACORDO_STATUS.PENDENTE, PARCELA_ACORDO_STATUS.VENCIDA])
    .order('vencimento', { ascending: true })

  if (error) throw new Error(`Erro ao carregar parcelas de acordo: ${error.message}`)

  const map = new Map<string, any[]>()
  for (const parcela of data ?? []) {
    const list = map.get((parcela as any).acordo_id) ?? []
    list.push(parcela)
    map.set((parcela as any).acordo_id, list)
  }
  return map
}

export async function processarReguaAcordos(
  params: ProcessarReguaAcordosParams = {},
): Promise<ResultadoLoteReguaAcordos> {
  const supabase = createAdminClient()
  const total = novoContador()
  const itens: ResultadoLoteReguaAcordos['itens'] = []
  const lotesPorCarteira = new Map<string, LoteContext>()

  const data = await fetchAllRows((from, to) => {
    let query: any = supabase
      .from('acordos')
      .select(
        `
        id,
        carteira_id,
        cobranca_id,
        condominio_id,
        unidade_id,
        valor_acordado,
        data_acordo,
        status,
        status_financeiro,
        risco,
        condominios(id, nome, regua_acordo_id),
        unidades(id, identificacao, bloco, responsavel_nome, telefone, email)
      `,
      )
      .in('status', ACORDO_STATUS_VIGENTES)
      .neq('status_financeiro', 'quitado')
      .range(from, to)

    if (params.scope) query = applyCarteiraScope(query, params.scope.carteiraIds)
    if (params.carteiraId) query = query.eq('carteira_id', params.carteiraId)
    if (params.condominioId) query = query.eq('condominio_id', params.condominioId)
    return query
  }, 'Erro ao buscar acordos para régua')

  const acordosNormalizados = normalizeRelationsList((data ?? []) as any[], ['condominios', 'unidades']) as any[]
  const apoioMap = await loadResponsaveisApoioMap(supabase, acordosNormalizados)
  const acordos = acordosNormalizados
    .map((row) => withResponsavelApoio(row, apoioMap))
    .filter((row) => matchesSearch(row, params.q))
    .filter((row) => matchesContato(row, params.contato))
  const parcelasPorAcordo = await carregarParcelasAbertas(
    supabase,
    acordos.map((acordo) => acordo.id),
  )

  async function getLote(acordo: any): Promise<LoteContext> {
    const carteiraId = acordo.carteira_id as string | undefined
    if (!carteiraId) throw new Error('Acordo sem carteira_id.')

    const atual = lotesPorCarteira.get(carteiraId)
    if (atual) return atual

    const id = await criarLote({
      supabase,
      carteiraId,
      operadorId: params.scope?.userId,
      origem: params.origem ?? 'manual',
    })
    const novo = { id, contadores: novoContador() }
    lotesPorCarteira.set(carteiraId, novo)
    return novo
  }

  try {
    const dataReferencia = cicloReferencia()

    for (const acordo of acordos) {
      const parcelas = parcelasPorAcordo.get(acordo.id) ?? []

      if (!parcelas.length) {
        const lote = await getLote(acordo)
        total.avaliadas += 1
        total.puladas += 1
        lote.contadores.avaliadas += 1
        lote.contadores.puladas += 1

        await criarItemLote({
          supabase,
          loteId: lote.id,
          acordo,
          status: LOTE_ITEM_STATUS.PULADA,
          motivo: 'Acordo sem parcelas abertas para régua.',
          payload: { acordo_id: acordo.id },
        })
        continue
      }

      for (const parcela of parcelas) {
        const lote = await getLote(acordo)
        total.avaliadas += 1
        lote.contadores.avaliadas += 1

        try {
          const diasRelativos = diasRelativosAoVencimento(parcela.vencimento)
          const condominio = acordo.condominios
          const unidade = acordo.unidades

          const suspensao = await verificarSuspensaoRegua({
            carteiraId: acordo.carteira_id,
            acordoId: acordo.id,
            unidadeId: unidade?.id ?? acordo.unidade_id ?? null,
            condominioId: condominio?.id ?? acordo.condominio_id ?? null,
          })

          if (suspensao.pausada) {
            total.puladas += 1
            lote.contadores.puladas += 1
            itens.push({ acordoId: acordo.id, parcelaId: parcela.id, status: LOTE_ITEM_STATUS.PULADA, motivo: suspensao.motivo ?? 'Régua pausada para este acordo/unidade/condomínio.' })
            await criarItemLote({ supabase, loteId: lote.id, acordo, parcela, status: LOTE_ITEM_STATUS.PULADA, motivo: suspensao.motivo ?? 'Régua pausada para este acordo/unidade/condomínio.', payload: { origem: 'suspensao_inteligente', suspensao, parcela_id: parcela.id } })
            continue
          }

          if (diasRelativos < -3) {
            total.puladas += 1
            lote.contadores.puladas += 1
            itens.push({
              acordoId: acordo.id,
              parcelaId: parcela.id,
              status: LOTE_ITEM_STATUS.PULADA,
              motivo: 'Parcela ainda fora da janela preventiva da régua.',
            })

            await criarItemLote({
              supabase,
              loteId: lote.id,
              acordo,
              parcela,
              status: LOTE_ITEM_STATUS.PULADA,
              motivo: 'Parcela ainda fora da janela preventiva da régua.',
              payload: { dias_relativos_vencimento: diasRelativos, parcela_id: parcela.id },
            })
            continue
          }

          const etapas = await carregarEtapasDeReguaAdmin(condominio?.regua_acordo_id, 'acordo')
          const etapa = selecionarEtapaAcordo({ etapas, diasRelativos }) ?? etapas[0] ?? DEFAULT_ACORDO_ETAPAS[0]
          const canal = etapa?.canal ?? 'whatsapp'
          const destinatario = canal === 'email' ? unidade?.email : unidade?.telefone
          const reguaEtapaId = normalizarEtapaId(etapa?.id)
          const etapaReferencia = reguaEtapaId ?? etapa?.id ?? null
          const fingerprint = criarReguaFingerprint({
            contexto: 'regua_acordo',
            entidadeId: parcela.id,
            etapaId: etapaReferencia,
            canal,
            ciclo: dataReferencia,
          })
          const tom = (etapa?.tom ?? (diasRelativos >= 2 ? 'agressivo' : diasRelativos >= 0 ? 'medio' : 'leve')) as ReguaTom

          const contexto = {
            carteira: acordo.carteira_id,
            nome_carteira: acordo.carteira_id,
            responsavel: unidade?.responsavel_nome ?? 'responsável',
            nome: unidade?.responsavel_nome ?? 'responsável',
            primeiro_nome: String(unidade?.responsavel_nome ?? 'responsável').split(' ')[0],
            unidade: unidade?.identificacao ?? 'unidade',
            condominio: condominio?.nome ?? 'condomínio',
            vencimento: formatDateBR(parcela.vencimento),
            valor: formatMoneyBR(parcela.valor),
            valor_parcela: formatMoneyBR(parcela.valor),
            valor_acordo: formatMoneyBR(acordo.valor_acordado),
            parcela: parcela.numero ?? '',
            parcela_numero: parcela.numero ?? '',
            dias_atraso: Math.max(0, diasRelativos),
          }

          const templateResolvido = await resolveTemplateMensagem({
            carteiraId: acordo.carteira_id,
            tipoRegua: 'acordo',
            categoria: (etapa as any).categoria_template,
            intensidade: tom,
            canal,
            templateId: (etapa as any).template_id,
            fallbackText: etapa?.template,
            variables: contexto,
          })
          const mensagem = templateResolvido.renderizado || montarMensagem({
            tipo: 'acordo',
            etapa,
            intensidade: tom,
            contexto,
          })

          const score = await salvarScoreRegua({
            carteiraId: acordo.carteira_id,
            acordoId: acordo.id,
            unidadeId: unidade?.id ?? acordo.unidade_id ?? null,
            condominioId: condominio?.id ?? acordo.condominio_id ?? null,
            valor: parcela.valor,
            diasAtraso: Math.max(0, diasRelativos),
            canal,
          })

          const compliance = await avaliarComplianceRegua({
            carteiraId: acordo.carteira_id,
            condominioId: condominio?.id ?? acordo.condominio_id ?? null,
            unidadeId: unidade?.id ?? acordo.unidade_id ?? null,
            acordoId: acordo.id,
            destinatario,
            canal,
          })

          if (!compliance.permitido) {
            total.puladas += 1
            lote.contadores.puladas += 1
            itens.push({ acordoId: acordo.id, parcelaId: parcela.id, status: LOTE_ITEM_STATUS.PULADA, motivo: compliance.motivo ?? 'Bloqueado por regra de compliance.' })
            await criarItemLote({ supabase, loteId: lote.id, acordo, parcela, status: LOTE_ITEM_STATUS.PULADA, motivo: compliance.motivo ?? 'Bloqueado por regra de compliance.', fingerprint, reguaEtapaId, payload: { canal, destinatario, contexto, template_resolvido: templateResolvido, parcela_id: parcela.id, score, compliance } })
            continue
          }

          if (!destinatario) {
            total.puladas += 1
            lote.contadores.puladas += 1
            itens.push({
              acordoId: acordo.id,
              parcelaId: parcela.id,
              status: LOTE_ITEM_STATUS.PULADA,
              motivo: 'Responsável sem destinatário para o canal selecionado.',
            })

            await criarItemLote({
              supabase,
              loteId: lote.id,
              acordo,
              parcela,
              status: LOTE_ITEM_STATUS.PULADA,
              motivo: 'Responsável sem destinatário para o canal selecionado.',
              fingerprint,
              reguaEtapaId,
              payload: { canal, destinatario, contexto, template_resolvido: templateResolvido, parcela_id: parcela.id, score, compliance },
            })
            continue
          }

          const { data: mensagemExistente } = await supabase
            .from('mensagens')
            .select('id')
            .eq('fingerprint', fingerprint)
            .limit(1)
            .maybeSingle()

          if (mensagemExistente?.id) {
            total.duplicadas += 1
            lote.contadores.duplicadas += 1
            itens.push({
              acordoId: acordo.id,
              parcelaId: parcela.id,
              status: LOTE_ITEM_STATUS.DUPLICADA,
              motivo: 'Mensagem de acordo já existia para esta parcela/etapa/canal/ciclo.',
              mensagemId: mensagemExistente.id,
            })

            await criarItemLote({
              supabase,
              loteId: lote.id,
              acordo,
              parcela,
              status: LOTE_ITEM_STATUS.DUPLICADA,
              motivo: 'Mensagem de acordo já existia para esta parcela/etapa/canal/ciclo.',
              fingerprint,
              reguaEtapaId,
              mensagemId: mensagemExistente.id,
              payload: { canal, destinatario, contexto, template_resolvido: templateResolvido, parcela_id: parcela.id, score, compliance },
            })
            continue
          }

          const { data: mensagemCriada, error: mensagemError } = await supabase
            .from('mensagens')
            .insert({
              carteira_id: acordo.carteira_id,
              contexto: 'acordo',
              acordo_id: acordo.id,
              canal,
              destinatario,
              conteudo: mensagem,
              conteudo_renderizado: mensagem,
              status: MENSAGEM_STATUS.PENDENTE_APROVACAO,
              status_operacional: MENSAGEM_STATUS.PENDENTE_APROVACAO,
              scheduled_at: new Date().toISOString(),
              agendada_para: new Date().toISOString(),
              lote_id: lote.id,
              regua_etapa_id: reguaEtapaId,
              fingerprint,
              template_id: templateResolvido.templateId,
              payload: { contexto, template_resolvido: templateResolvido, parcela_id: parcela.id, dias_relativos_vencimento: diasRelativos, score, compliance },
            } as any)
            .select('id')
            .single()

          if (mensagemError) throw new Error(mensagemError.message)

          const loteItemId = await criarItemLote({
            supabase,
            loteId: lote.id,
            acordo,
            parcela,
            status: LOTE_ITEM_STATUS.CRIADO,
            motivo: 'Mensagem de acordo criada com sucesso.',
            fingerprint,
            reguaEtapaId,
            mensagemId: mensagemCriada.id,
            payload: { canal, destinatario, contexto, template_resolvido: templateResolvido, parcela_id: parcela.id, score, compliance },
          })

          if (loteItemId) {
            await supabase
              .from('mensagens')
              .update({ lote_item_id: loteItemId } as any)
              .eq('id', mensagemCriada.id)
          }

          total.criadas += 1
          lote.contadores.criadas += 1
          itens.push({
            acordoId: acordo.id,
            parcelaId: parcela.id,
            status: LOTE_ITEM_STATUS.CRIADO,
            mensagemId: mensagemCriada.id,
          })
        } catch (itemError) {
          const motivo = itemError instanceof Error ? itemError.message : 'Erro inesperado ao processar parcela do acordo.'
          total.erros += 1
          lote.contadores.erros += 1
          itens.push({ acordoId: acordo.id, parcelaId: parcela.id, status: LOTE_ITEM_STATUS.ERRO, motivo })

          await criarItemLote({
            supabase,
            loteId: lote.id,
            acordo,
            parcela,
            status: LOTE_ITEM_STATUS.ERRO,
            motivo,
            payload: { erro: motivo, parcela_id: parcela.id },
          })
        }
      }
    }

    for (const lote of lotesPorCarteira.values()) {
      await atualizarLote({ supabase, loteId: lote.id, contadores: lote.contadores })
    }

    const loteIds = Array.from(lotesPorCarteira.values()).map((lote) => lote.id)

    return {
      loteId: loteIds[0] ?? '',
      loteIds,
      totalAvaliadas: total.avaliadas,
      totalCriadas: total.criadas,
      totalPuladas: total.puladas,
      totalDuplicadas: total.duplicadas,
      totalErros: total.erros,
      itens,
    }
  } catch (error) {
    const motivo = error instanceof Error ? error.message : 'Erro inesperado ao processar régua de acordos.'
    for (const lote of lotesPorCarteira.values()) {
      await atualizarLote({
        supabase,
        loteId: lote.id,
        contadores: lote.contadores,
        status: LOTE_STATUS.ERRO,
        erro: motivo,
      })
    }
    throw error
  }
}
