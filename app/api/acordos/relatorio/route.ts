import { filtrosRelatorioAcordos } from '@/features/acordos/filtros-relatorio'
import { criarExcelRelatorioAcordos } from '@/features/acordos/exportacao-excel'
import { carregarParcelasRelatorio } from '@/features/acordos/parcelas-relatorio'
import { listAcordosComSaudeFiltered } from '@/features/acordos/queries'
import { createClient } from '@/utils/supabase/server'
import { getPermittedCarteiras } from '@/utils/auth/get-permitted-carteiras'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const filters = filtrosRelatorioAcordos(searchParams)

  const scope = await getPermittedCarteiras()
  const rows = await listAcordosComSaudeFiltered(scope, filters)
  const acordoIds = rows.map((row: any) => row.id).filter(Boolean)
  let parcelas: any[] = []

  if (acordoIds.length > 0) {
    const supabase = await createClient()
    parcelas = await carregarParcelasRelatorio(acordoIds, (ids, from, to) =>
      supabase
        .from('parcelas_acordo')
        .select('id, acordo_id, numero, tipo_parcela, valor, vencimento, status, data_pagamento, valor_repasse_informado')
        .in('acordo_id', ids)
        .order('id', { ascending: true })
        .range(from, to),
    )
  }

  const buffer = await criarExcelRelatorioAcordos(filters, rows, parcelas)
  const fileName = `gkli-relatorio-acordos-${new Date().toISOString().slice(0, 10)}.xlsx`

  return new Response(buffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${fileName}"`,
      'Cache-Control': 'no-store',
    },
  })
}
