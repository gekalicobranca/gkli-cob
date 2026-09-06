import { getPermittedCarteiras } from '@/utils/auth/get-permitted-carteiras'
import { createClient } from '@/utils/supabase/server'
import { listCondominios, normalizeCondominioFilters } from '@/features/condominios/queries'
import { sortCondominios } from '@/features/condominios/sort'
import { montarRelatorioCondominios } from '@/features/condominios/relatorio-executivo'
import { getCondominiosAgenteStatus } from '@/features/agente-automatico/queries'

export const runtime = 'nodejs'

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams
  const scope = await getPermittedCarteiras()
  const filters = normalizeCondominioFilters({
    search: params.get('q') ?? undefined,
    carteiraId: params.get('carteira_id') ?? undefined,
    administradora: params.get('administradora') ?? undefined,
    status: params.get('status') ?? 'ativo',
  })
  try {
    const rows = sortCondominios(await listCondominios(scope, filters, { all: true }), params.get('ordenar') ?? 'nome')
    const ids = [...new Set<string>(rows.flatMap(row => [row.regua_cobranca_id, row.regua_acordo_id, row.regua_pre_juridico_id]).filter(Boolean))]
    const reguas = new Map<string, string>()
    if (ids.length) {
      const supabase = await createClient()
      for (let i = 0; i < ids.length; i += 100) {
        const { data, error } = await supabase.from('reguas').select('id,nome').in('id', ids.slice(i, i + 100))
        if (error) throw new Error('Erro ao carregar réguas do relatório.')
        for (const row of data ?? []) reguas.set(row.id, row.nome)
      }
    }
    const labels = [
      `Status: ${filters.status || 'todos'}`,
      filters.search ? `Busca: ${filters.search}` : '',
      filters.administradora ? `Administradora: ${filters.administradora}` : '',
      filters.carteiraId ? `Carteira: ${rows[0]?.carteiras?.nome || 'selecionada (sem resultados)'}` : 'Carteiras: todas as permitidas',
    ].filter(Boolean)
    const agenteStatuses = await getCondominiosAgenteStatus(rows.map(row => row.id), scope.carteiraIds)
    const reportRows = rows.map(row => ({ ...row, agente_remoto_status: agenteStatuses.get(row.id) ?? 'indisponivel' }))
    const pdf = montarRelatorioCondominios(reportRows, reguas, labels)
    return new Response(new Uint8Array(pdf), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="gkli-relatorio-executivo-condominios-${new Date().toISOString().slice(0, 10)}.pdf"`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (error) {
    console.error('Erro ao gerar relatório executivo de condomínios:', error)
    return Response.json({ error: 'Não foi possível gerar o relatório executivo de condomínios. Tente novamente.' }, { status: 500 })
  }
}
