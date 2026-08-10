import Link from 'next/link'
import { AlertTriangle } from 'lucide-react'
import { PageHeader } from '@/components/ui/page-header'
import { Card } from '@/components/ui/card'
import { ListKpiGrid } from '@/components/layout/list-page'
import { ButtonLink } from '@/components/ui/button'
import { PrintButton } from '@/components/ui/print-button'
import { formatCurrency } from '@/utils/formatters/currency'
import { formatDateBR } from '@/utils/formatters/date'
import { getPermittedCarteiras } from '@/utils/auth/get-permitted-carteiras'
import { listAgreementBreakReport } from '@/features/acordos/queries'

export default async function RelatorioAcordosRompimentosPage() {
  const scope = await getPermittedCarteiras()
  const rows = await listAgreementBreakReport(scope)
  const total = rows.reduce((sum, row) => sum + Number(row.valorRompido ?? 0), 0)

  return (
    <div className="space-y-5 print:bg-white">
      <PageHeader
        eyebrow="Relatórios"
        title="Rompimentos de acordos"
        description="Síntese por condomínio e ficha detalhada dos acordos rompidos."
        actions={
          <>
            <ButtonLink href="/app/relatorios" variant="secondary">Voltar</ButtonLink>
            <PrintButton />
          </>
        }
      />

      <ListKpiGrid className="xl:grid-cols-2">
        <Card className="p-3">
          <p className="text-xs font-medium uppercase text-slate-400">Rompimentos</p>
          <p className="mt-1.5 text-2xl font-semibold text-slate-950">{rows.reduce((sum, row) => sum + row.qtdRompimentos, 0)}</p>
        </Card>
        <Card className="p-3">
          <p className="text-xs font-medium uppercase text-slate-400">Valor rompido</p>
          <p className="mt-1.5 text-2xl font-semibold text-slate-950">{formatCurrency(total)}</p>
        </Card>
      </ListKpiGrid>

      <Card className="overflow-hidden p-0">
        <div className="border-b border-slate-100 px-5 py-4">
          <div className="flex items-center gap-2"><AlertTriangle size={18} className="text-red-600" /><h2 className="text-base font-medium text-slate-950">Rompimentos por condomínio</h2></div>
        </div>
        <div className="divide-y divide-slate-100">
          {rows.length === 0 ? <div className="px-5 py-6 text-sm text-slate-500">Sem rompimentos no escopo.</div> : rows.map((row) => (
            <div key={row.id} className="px-5 py-4">
              <div className="grid gap-3 md:grid-cols-[1fr_120px_160px] md:items-center">
                <p className="truncate text-sm font-semibold text-slate-950">{row.nome}</p>
                <p className="text-sm text-slate-600">{row.qtdRompimentos} romp.</p>
                <p className="text-sm font-semibold text-slate-950">{formatCurrency(row.valorRompido)}</p>
              </div>
              <div className="mt-3 space-y-2">
                {row.acordos.map((acordo: any) => (
                  <Link key={acordo.id} href={`/app/acordos/${acordo.id}`} className="grid rounded-2xl bg-slate-50 px-4 py-3 text-sm transition hover:bg-slate-100 md:grid-cols-[1fr_120px_140px_130px]">
                    <span className="truncate text-slate-700">Unidade {acordo.unidades?.identificacao ?? '-'} · {acordo.unidades?.responsavel_nome ?? 'Responsável não informado'}</span>
                    <span className="text-red-700">{acordo.status ?? 'rompido'}</span>
                    <span className="font-medium text-slate-950">{formatCurrency(Number(acordo.valor_acordado ?? 0))}</span>
                    <span className="text-slate-500">{formatDateBR(acordo.data_acordo)}</span>
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  )
}
