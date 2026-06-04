import Link from 'next/link'
import { TrendingUp } from 'lucide-react'
import { PageHeader } from '@/components/ui/page-header'
import { Card } from '@/components/ui/card'
import { ButtonLink } from '@/components/ui/button'
import { PrintButton } from '@/components/ui/print-button'
import { formatCurrency } from '@/utils/formatters/currency'
import { getPermittedCarteiras } from '@/utils/auth/get-permitted-carteiras'
import { listAgreementRecoveryByCarteira, listAgreementRecoveryByCondominio } from '@/features/acordos/queries'

function Percent({ value }: { value: number }) {
  return <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">{value}%</span>
}

export default async function RelatorioAcordosRecuperacaoPage() {
  const scope = await getPermittedCarteiras()
  const [carteiras, condominios] = await Promise.all([
    listAgreementRecoveryByCarteira(scope),
    listAgreementRecoveryByCondominio(scope),
  ])

  return (
    <div className="space-y-5 print:bg-white">
      <PageHeader
        eyebrow="Relatórios"
        title="Recuperação de acordos"
        description="Versão sintética por carteira e detalhada por condomínio."
        actions={
          <>
            <ButtonLink href="/app/relatorios" variant="secondary">Voltar</ButtonLink>
            <PrintButton />
          </>
        }
      />

      <Card className="overflow-hidden p-0">
        <div className="border-b border-slate-100 px-5 py-4">
          <div className="flex items-center gap-2"><TrendingUp size={18} className="text-[var(--gkli-primary)]" /><h2 className="text-base font-medium text-slate-950">Sintético por carteira</h2></div>
        </div>
        <div className="divide-y divide-slate-100">
          {carteiras.length === 0 ? <div className="px-5 py-6 text-sm text-slate-500">Sem acordos no escopo.</div> : carteiras.map((row) => (
            <div key={row.id} className="grid gap-3 px-5 py-4 md:grid-cols-[1fr_110px_150px_150px_110px] md:items-center">
              <p className="truncate text-sm font-medium text-slate-950">{row.nome}</p>
              <p className="text-sm text-slate-600">{row.qtdAcordos} acordos</p>
              <p className="text-sm font-semibold text-slate-950">{formatCurrency(row.valorAcordado)}</p>
              <p className="text-sm font-semibold text-emerald-700">{formatCurrency(row.valorRecuperado)}</p>
              <Percent value={row.taxaRecuperacao} />
            </div>
          ))}
        </div>
      </Card>

      <Card className="overflow-hidden p-0">
        <div className="border-b border-slate-100 px-5 py-4">
          <h2 className="text-base font-medium text-slate-950">Detalhado por condomínio</h2>
          <p className="mt-1 text-sm text-slate-500">Clique no acordo para abrir a ficha operacional.</p>
        </div>
        <div className="divide-y divide-slate-100">
          {condominios.map((condominio) => (
            <div key={condominio.id} className="px-5 py-4">
              <div className="grid gap-3 md:grid-cols-[1fr_110px_150px_150px_110px] md:items-center">
                <p className="truncate text-sm font-semibold text-slate-950">{condominio.nome}</p>
                <p className="text-sm text-slate-600">{condominio.qtdAcordos} acordos</p>
                <p className="text-sm font-semibold text-slate-950">{formatCurrency(condominio.valorAcordado)}</p>
                <p className="text-sm font-semibold text-emerald-700">{formatCurrency(condominio.valorRecuperado)}</p>
                <Percent value={condominio.taxaRecuperacao} />
              </div>
              <div className="mt-3 space-y-2">
                {condominio.acordos.slice(0, 8).map((acordo: any) => (
                  <Link key={acordo.id} href={`/app/acordos/${acordo.id}`} className="grid rounded-2xl bg-slate-50 px-4 py-3 text-sm transition hover:bg-slate-100 md:grid-cols-[1fr_130px_140px]">
                    <span className="truncate text-slate-700">Unidade {acordo.unidades?.identificacao ?? '-'} · {acordo.unidades?.responsavel_nome ?? 'Responsável não informado'}</span>
                    <span className="text-slate-500">{acordo.status ?? '-'}</span>
                    <span className="font-medium text-slate-950">{formatCurrency(Number(acordo.valor_acordado ?? 0))}</span>
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
