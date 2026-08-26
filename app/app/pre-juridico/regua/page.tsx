import Link from 'next/link'
import { AlertTriangle, CheckCircle2, GitBranch, Plus, WalletCards } from 'lucide-react'
import { PageHeader } from '@/components/ui/page-header'
import { Card } from '@/components/ui/card'
import { StatusBadge } from '@/components/data/status-badge'
import { listReguasOperacionais } from '@/features/reguas/queries'
import { criarReguaOperacional } from '@/features/reguas/actions'
import { listCarteirasForSelect } from '@/features/cadastros/queries'
import { getPermittedCarteiras } from '@/utils/auth/get-permitted-carteiras'

export default async function ReguaPreJuridicoPage() {
  const scope = await getPermittedCarteiras()
  const [reguas, carteiras] = await Promise.all([
    listReguasOperacionais(scope, 'juridico'),
    listCarteirasForSelect(scope),
  ])
  const reguasPorCarteira = reguas.filter((regua: any) => Boolean(regua.carteira_id))
  const carteirasConfiguradas = new Set(reguasPorCarteira.map((regua: any) => regua.carteira_id))
  const carteirasPendentes = carteiras.filter((carteira: any) => !carteirasConfiguradas.has(carteira.id))

  return (
    <div className="space-y-5">
      <PageHeader eyebrow="Pré-Jurídico" title="Réguas por carteira" description="Configure o fluxo pré-jurídico de cada carteira. Todos os condomínios da carteira seguem a mesma régua." />

      <section className="grid gap-3 md:grid-cols-3">
        <Card className="p-4"><CheckCircle2 className="text-emerald-600" size={19} /><p className="mt-3 text-2xl font-semibold">{carteirasConfiguradas.size}</p><p className="text-sm text-slate-500">carteiras com régua configurada</p></Card>
        <Card className="p-4"><AlertTriangle className="text-amber-600" size={19} /><p className="mt-3 text-2xl font-semibold">{carteirasPendentes.length}</p><p className="text-sm text-slate-500">carteiras sem régua própria</p></Card>
        <Card className="p-4"><WalletCards className="text-[#04799a]" size={19} /><p className="mt-3 text-2xl font-semibold">{reguasPorCarteira.length}</p><p className="text-sm text-slate-500">réguas pré-jurídicas ativas</p></Card>
      </section>

      <Card className="p-5">
        <div className="flex items-start gap-3">
          <GitBranch className="mt-0.5 text-violet-600" size={20} />
          <div>
            <h2 className="font-semibold text-slate-950">Criar régua para uma carteira</h2>
            <p className="mt-1 text-sm text-slate-500">A régua será aplicada a todos os condomínios vinculados à carteira selecionada.</p>
          </div>
        </div>
        <form action={criarReguaOperacional} className="mt-5 grid gap-3 lg:grid-cols-[minmax(220px,1fr)_minmax(220px,1fr)_120px_minmax(260px,1.4fr)_auto] lg:items-end">
          <input type="hidden" name="tipo" value="juridico" /><input type="hidden" name="status" value="ativa" /><input type="hidden" name="destinatario_preferencial" value="qualquer" />
          <label className="space-y-1.5"><span className="text-xs font-medium text-slate-600">Nome</span><input name="nome" required placeholder="Ex.: Pré-Jurídico Carteira Sul" className="h-9 w-full rounded-lg border border-slate-200 px-3 text-sm" /></label>
          <label className="space-y-1.5"><span className="text-xs font-medium text-slate-600">Carteira</span><select name="carteira_id" required defaultValue="" className="h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm"><option value="" disabled>Selecione a carteira</option>{carteiras.map((carteira: any) => <option key={carteira.id} value={carteira.id}>{carteira.nome}</option>)}</select></label>
          <label className="space-y-1.5"><span className="text-xs font-medium text-slate-600">Prioridade</span><input name="prioridade" type="number" defaultValue="90" className="h-9 w-full rounded-lg border border-slate-200 px-3 text-sm" /></label>
          <label className="space-y-1.5"><span className="text-xs font-medium text-slate-600">Descrição</span><input name="descricao" placeholder="Objetivo e regra de uso" className="h-9 w-full rounded-lg border border-slate-200 px-3 text-sm" /></label>
          <button className="inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-[var(--gkli-primary)] px-4 text-sm font-medium text-white"><Plus size={15} />Criar</button>
        </form>
      </Card>

      <Card className="overflow-hidden p-0">
        <div className="border-b border-slate-100 px-5 py-4">
          <h2 className="font-semibold text-slate-950">Configuração das carteiras</h2>
          <p className="mt-1 text-sm text-slate-500">Abra uma régua para revisar etapas, mensagens, canais e prazos.</p>
        </div>
        {carteiras.length ? <div className="divide-y divide-slate-100">{carteiras.map((carteira: any) => {
          const vinculadas = reguasPorCarteira.filter((regua: any) => regua.carteira_id === carteira.id)
          return <div key={carteira.id} className="grid gap-3 px-5 py-4 md:grid-cols-[minmax(220px,1fr)_minmax(260px,1.4fr)] md:items-center"><div><p className="font-semibold text-slate-950">{carteira.nome}</p><div className="mt-2"><StatusBadge status={vinculadas.length ? 'configurada' : 'pendente'} /></div></div><div className="flex flex-wrap gap-2">{vinculadas.length ? vinculadas.map((regua: any) => <Link key={regua.id} href={`/app/mensageria/reguas/${regua.id}`} className="min-w-56 flex-1 rounded-xl border border-slate-200 p-3 transition hover:border-violet-300 hover:bg-violet-50/40"><div className="flex items-center justify-between gap-2"><p className="text-sm font-semibold text-slate-900">{regua.nome}</p><StatusBadge status={regua.status || 'ativa'} /></div><p className="mt-1 text-xs text-slate-500">Prioridade {regua.prioridade ?? 0}</p></Link>) : <p className="text-sm text-slate-500">Nenhuma régua cadastrada para esta carteira.</p>}</div></div>
        })}</div> : <div className="p-8 text-center text-sm text-slate-500">Nenhuma carteira disponível.</div>}
      </Card>
    </div>
  )
}
