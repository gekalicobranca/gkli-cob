import { AlertTriangle, CheckCircle2, Clock3, Scale } from 'lucide-react'
import { PageHeader } from '@/components/ui/page-header'
import { Card } from '@/components/ui/card'
import { PreJuridicoModuleNav } from '@/components/pre-juridico/module-nav'
import { PreJuridicoWorkbench } from '@/app/app/acordos/gestao/pre-juridico-workbench'
import { listAcordosQuebradosParaGestao } from '@/features/acordos/queries'
import { preJuridicoStepsCompletos } from '@/features/acordos/pre-juridico'
import { getPermittedCarteiras } from '@/utils/auth/get-permitted-carteiras'
import { formatCurrency } from '@/utils/formatters/currency'

type Params = Promise<{ q?: string; etapa?: string }>

function normalize(value: unknown) {
  return String(value ?? '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

function isEncaminhado(row: any) {
  const fluxo = normalize(row.fluxo_status)
  const cobranca = normalize(row.cobrancas?.status_operacional ?? row.cobrancas?.status)
  return fluxo.includes('pre_juridico') || cobranca.includes('pre_juridico')
}

function etapa(row: any) {
  if (isEncaminhado(row)) return 'encaminhado'
  return preJuridicoStepsCompletos(row.pre_juridico_steps) ? 'pronto' : 'documentacao'
}

export default async function PreJuridicoPage({ searchParams }: { searchParams: Params }) {
  const params = await searchParams
  const scope = await getPermittedCarteiras()
  const baseRows = await listAcordosQuebradosParaGestao(scope)
  const termo = normalize(params.q)
  const etapaFiltro = normalize(params.etapa)
  const rows = baseRows.filter((row: any) => {
    if (etapaFiltro && etapa(row) !== etapaFiltro) return false
    if (!termo) return true
    return normalize([row.condominios?.nome, row.unidades?.identificacao, row.unidades?.responsavel_nome].filter(Boolean).join(' ')).includes(termo)
  })
  const entrada = baseRows.filter((row: any) => etapa(row) === 'documentacao')
  const prontos = baseRows.filter((row: any) => etapa(row) === 'pronto')
  const encaminhados = baseRows.filter((row: any) => etapa(row) === 'encaminhado')
  const valor = baseRows.reduce((sum: number, row: any) => sum + Number(row.valor_risco_operacional ?? row.valor_acordado ?? 0), 0)

  return (
    <div className="space-y-5">
      <PageHeader eyebrow="Pré-Jurídico" title="Painel de preparação" description="Organize documentos, valide impedimentos e encaminhe somente os casos prontos para o jurídico." />
      <PreJuridicoModuleNav active="painel" />

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {[
          { label: 'Em documentação', value: entrada.length, detail: 'casos com etapa obrigatória pendente', icon: Clock3, tone: 'text-amber-700 bg-amber-50' },
          { label: 'Prontos para envio', value: prontos.length, detail: 'documentação obrigatória concluída', icon: CheckCircle2, tone: 'text-emerald-700 bg-emerald-50' },
          { label: 'Encaminhados', value: encaminhados.length, detail: 'casos que já saíram da preparação', icon: Scale, tone: 'text-violet-700 bg-violet-50' },
          { label: 'Valor em tratamento', value: formatCurrency(valor), detail: `${baseRows.length} caso(s) no escopo geral`, icon: AlertTriangle, tone: 'text-rose-700 bg-rose-50' },
        ].map(({ label, value, detail, icon: Icon, tone }) => (
          <Card key={label} className="p-4">
            <div className="flex items-start justify-between gap-3">
              <div><p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">{label}</p><p className="mt-2 text-2xl font-semibold text-slate-950">{value}</p><p className="mt-1 text-xs leading-5 text-slate-500">{detail}</p></div>
              <span className={`rounded-xl p-2 ${tone}`}><Icon size={18} aria-hidden="true" /></span>
            </div>
          </Card>
        ))}
      </section>

      <Card className="p-4">
        <form className="grid gap-3 md:grid-cols-[minmax(260px,1fr)_220px_auto] md:items-end">
          <label className="space-y-1.5"><span className="text-xs font-medium text-slate-600">Buscar caso</span><input name="q" defaultValue={params.q ?? ''} placeholder="Condomínio, unidade ou responsável" className="h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-[var(--gkli-primary)]" /></label>
          <label className="space-y-1.5"><span className="text-xs font-medium text-slate-600">Etapa</span><select name="etapa" defaultValue={params.etapa ?? ''} className="h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm"><option value="">Todas as etapas</option><option value="documentacao">Em documentação</option><option value="pronto">Prontos</option><option value="encaminhado">Encaminhados</option></select></label>
          <button className="h-9 rounded-lg bg-[var(--gkli-primary)] px-4 text-sm font-medium text-white">Aplicar filtros</button>
        </form>
        {(params.q || params.etapa) ? <a href="/app/pre-juridico" className="mt-3 inline-flex text-xs font-medium text-[var(--gkli-primary)] hover:underline">Limpar filtros</a> : null}
      </Card>

      <PreJuridicoWorkbench rows={rows} />
    </div>
  )
}
