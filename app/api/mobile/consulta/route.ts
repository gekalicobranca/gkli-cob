import { getPermittedCarteiras } from '@/utils/auth/get-permitted-carteiras'
import { getCondominioIntegral } from '@/features/condominios/queries'
import { carregarResumoCobrancasMobile } from '@/features/mobile/cobrancas-queries'
import { listAcordosComSaudeFiltered } from '@/features/acordos/queries'
import { carregarParcelasRelatorio } from '@/features/acordos/parcelas-relatorio'
import { createClient } from '@/utils/supabase/server'
import { getTvResults } from '@/features/dashboard/tv-actions'
import { MOBILE_VIEWS, periodoMobileValido } from '@/features/mobile/consulta'
import { pagamentoParcelaExecutivo, repasseParcelaExecutivo } from '@/features/acordos/parcelas-executivo'

export async function GET(request: Request) {
  const p = new URL(request.url).searchParams
  const view = p.get('view') ?? ''
  if (!MOBILE_VIEWS.some(v => v === view)) return Response.json({ error: 'Selecione uma consulta válida.' }, { status: 400 })
  try {
    const permitted = await getPermittedCarteiras()
    const carteiraId = p.get('carteira_id') || '', condominioId = p.get('condominio_id') || ''
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    const periodoId = p.get('periodo_id') ?? ''
    if (!uuid.test(periodoId)) return Response.json({ error: 'Selecione um período de fechamento cadastrado.' }, { status: 400 })
    const db = await createClient()
    const { data: periodo, error: periodoError } = await db.from('fechamento_periodos').select('data_abertura,data_fechamento').eq('id', periodoId).neq('status', 'cancelado').maybeSingle()
    if (periodoError) throw periodoError
    if (!periodo || !periodoMobileValido(periodo.data_abertura, periodo.data_fechamento)) return Response.json({ error: 'Período de fechamento indisponível.' }, { status: 400 })
    const inicio = periodo.data_abertura, fim = periodo.data_fechamento
    if ((carteiraId && !uuid.test(carteiraId)) || (condominioId && !uuid.test(condominioId))) return Response.json({ error: 'Seleção inválida.' }, { status: 400 })
    if (carteiraId && permitted.carteiraIds !== null && !permitted.carteiraIds.includes(carteiraId)) return Response.json({ error: 'Carteira indisponível para seu acesso.' }, { status: 403 })
    if (condominioId && !await getCondominioIntegral(condominioId, permitted)) return Response.json({ error: 'Condomínio indisponível para seu acesso.' }, { status: 403 })
    const scope = carteiraId ? { ...permitted, carteiraIds: [carteiraId] } : permitted
    const requestedPage = Number(p.get('page'))
    const page = Number.isFinite(requestedPage) && requestedPage > 0 ? Math.floor(requestedPage) : 1
    const size = 30
    const respond = (data: object) => Response.json(data, { headers: { 'Cache-Control': 'private, no-store' } })
    if (view === 'resultados') {
      const data = await getTvResults(inicio, fim, { carteiraId, condominioId })
      return respond({ metrics: data.result, acordos: data.agreements.period, updatedAt: data.updatedAt })
    }
    if (view === 'cobrancas') {
      return respond({ cobrancasResumo: await carregarResumoCobrancasMobile(scope, condominioId) })
    }
    const rows = await listAcordosComSaudeFiltered(scope, { tipo_acordo: view === 'judiciais' ? 'judicial' : 'extrajudicial', condominio_id: condominioId, data_de: inicio, data_ate: fim, ordenar: 'condominio' })
    const subset = rows.slice((page - 1) * size, page * size)
    const parcelas = await carregarParcelasRelatorio(subset.map(r => r.id), (ids, from, to) => db.from('parcelas_acordo')
      .select('id,acordo_id,numero,tipo_parcela,valor,vencimento,status,data_pagamento,valor_repasse_informado').in('acordo_id', ids)
      .gte('vencimento', inicio).lte('vencimento', fim).order('id').range(from, to))
    const items = subset.map(r => ({ id: r.id, condominio: r.condominios?.nome, carteira: r.carteiras?.nome,
      unidade: r.unidades?.identificacao, bloco: r.unidades?.bloco, responsavel: r.unidades?.responsavel_nome, status: r.status,
      valor: Number(r.valor_acordado ?? 0), processo: r.numero_processo,
      parcelas: parcelas.filter(parcela => parcela.acordo_id === r.id).map(parcela => ({ id: parcela.id, numero: parcela.numero, valor: Number(parcela.valor), vencimento: parcela.vencimento,
        pagamento: pagamentoParcelaExecutivo(parcela), dataPagamento: parcela.data_pagamento, repasse: repasseParcelaExecutivo(parcela) })) }))
    return respond({ items, total: rows.length, page, pages: Math.max(1, Math.ceil(rows.length / size)) })
  } catch (error) {
    console.error('Erro na consulta mobile:', error)
    return Response.json({ error: 'Não foi possível carregar a consulta. Tente novamente.' }, { status: 500 })
  }
}
