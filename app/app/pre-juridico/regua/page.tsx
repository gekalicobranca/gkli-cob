import Link from 'next/link'
import { AlertTriangle, CheckCircle2, ChevronDown, Clock3, GitBranch, Plus, Settings2 } from 'lucide-react'
import { PageHeader } from '@/components/ui/page-header'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/select'
import { ClearFiltersLink, ListFilterField, ListFiltersForm, ListPanel, ListPanelHeader, ListSearchField, ListTitle, ListTitleBar } from '@/components/layout/list-page'
import { StatusBadge } from '@/components/data/status-badge'
import { listCondominios } from '@/features/condominios/queries'
import { listReguasOperacionais } from '@/features/reguas/queries'
import { criarReguaOperacional } from '@/features/reguas/actions'
import { vincularReguaPreJuridico } from '@/features/pre-juridico/reguas-actions'
import { listCarteirasForSelect } from '@/features/cadastros/queries'
import { getPermittedCarteiras } from '@/utils/auth/get-permitted-carteiras'
import { PreJuridicoModuleNav } from '@/components/pre-juridico/module-nav'

type Params = Promise<{ q?: string; configuracao?: string }>
const norm = (value: unknown) => String(value ?? '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')

export default async function ReguaPreJuridicoPage({ searchParams }: { searchParams: Params }) {
  const params = await searchParams
  const scope = await getPermittedCarteiras()
  const [baseRows, reguas, carteiras] = await Promise.all([
    listCondominios(scope, { status: 'ativo' }),
    listReguasOperacionais(scope, 'juridico'),
    listCarteirasForSelect(scope),
  ])
  const termo = norm(params.q)
  const configured = (row: any) => row.dias_expiracao_regua_pre_juridico !== null && row.dias_expiracao_regua_pre_juridico !== undefined
  const rows = baseRows.filter((row: any) => {
    if (params.configuracao === 'ativa' && !configured(row)) return false
    if (params.configuracao === 'pendente' && configured(row)) return false
    return !termo || norm([row.nome_operacional, row.nome, row.administradora, row.carteiras?.nome].join(' ')).includes(termo)
  })
  const ativos = baseRows.filter(configured)
  const pendentes = baseRows.filter((row: any) => !configured(row))
  const media = ativos.length ? Math.round(ativos.reduce((sum: number, row: any) => sum + Number(row.inicio_cobranca_dias ?? 0) + Number(row.dias_expiracao_regua_pre_juridico ?? 0), 0) / ativos.length) : 0

  return (
    <div className="space-y-5">
      <PageHeader eyebrow="Pré-Jurídico" title="Régua de encaminhamento" description="Revise quando cada condomínio sai da cobrança extrajudicial e entra na preparação pré-jurídica." />
      <PreJuridicoModuleNav active="regua" />
      <Card className="p-5">
        <div className="flex items-start gap-3"><GitBranch className="mt-0.5 text-violet-600" size={20} /><div><h2 className="font-semibold text-slate-950">Réguas exclusivas do Pré-Jurídico</h2><p className="mt-1 text-sm text-slate-500">Essas réguas não aparecem misturadas às rotinas de cobrança e acordo. A prioridade é: condomínio, carteira e, por último, régua global.</p></div></div>
        <form action={criarReguaOperacional} className="mt-5 grid gap-3 lg:grid-cols-[minmax(220px,1fr)_minmax(200px,1fr)_120px_minmax(260px,1.4fr)_auto] lg:items-end">
          <input type="hidden" name="tipo" value="juridico" /><input type="hidden" name="status" value="ativa" /><input type="hidden" name="destinatario_preferencial" value="qualquer" />
          <label className="space-y-1.5"><span className="text-xs font-medium text-slate-600">Nome</span><input name="nome" required placeholder="Ex.: Pré-Jurídico padrão" className="h-9 w-full rounded-lg border border-slate-200 px-3 text-sm" /></label>
          <label className="space-y-1.5"><span className="text-xs font-medium text-slate-600">Carteira</span><select name="carteira_id" className="h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm"><option value="">Global / fallback</option>{carteiras.map((c: any) => <option key={c.id} value={c.id}>{c.nome}</option>)}</select></label>
          <label className="space-y-1.5"><span className="text-xs font-medium text-slate-600">Prioridade</span><input name="prioridade" type="number" defaultValue="90" className="h-9 w-full rounded-lg border border-slate-200 px-3 text-sm" /></label>
          <label className="space-y-1.5"><span className="text-xs font-medium text-slate-600">Descrição</span><input name="descricao" placeholder="Objetivo e regra de uso" className="h-9 w-full rounded-lg border border-slate-200 px-3 text-sm" /></label>
          <button className="inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-[var(--gkli-primary)] px-4 text-sm font-medium text-white"><Plus size={15} />Criar</button>
        </form>
        <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">{reguas.length ? reguas.map((regua: any) => <Link key={regua.id} href={`/app/mensageria/reguas/${regua.id}`} className="rounded-xl border border-slate-200 p-4 transition hover:border-violet-300 hover:bg-violet-50/40"><div className="flex items-center justify-between gap-3"><p className="font-semibold text-slate-950">{regua.nome}</p><StatusBadge status={regua.status || 'ativa'} /></div><p className="mt-2 text-xs text-slate-500">{regua.carteiras?.nome || 'Global / fallback'} · prioridade {regua.prioridade ?? 0}</p><p className="mt-2 line-clamp-2 text-sm text-slate-600">{regua.descricao || 'Sem descrição.'}</p></Link>) : <p className="text-sm text-slate-500">Nenhuma régua específica cadastrada. Ao gerar o primeiro lote, o sistema ainda poderá criar o fallback global automaticamente.</p>}</div>
      </Card>
      <section className="grid gap-3 md:grid-cols-3">
        <Card className="p-4"><CheckCircle2 className="text-emerald-600" size={19} /><p className="mt-3 text-2xl font-semibold">{ativos.length}</p><p className="text-sm text-slate-500">condomínios com expiração configurada</p></Card>
        <Card className="p-4"><AlertTriangle className="text-amber-600" size={19} /><p className="mt-3 text-2xl font-semibold">{pendentes.length}</p><p className="text-sm text-slate-500">sem encaminhamento automático</p></Card>
        <Card className="p-4"><Clock3 className="text-[#04799a]" size={19} /><p className="mt-3 text-2xl font-semibold">D+{media}</p><p className="text-sm text-slate-500">prazo total médio até o pré-jurídico</p></Card>
      </section>
      <ListPanel>
        <ListPanelHeader className="bg-white/80"><ListTitleBar className="xl:items-center"><ListTitle title="Configuração por condomínio" description="Defina o prazo de entrada e uma régua exclusiva quando necessário." /><ClearFiltersLink href="/app/pre-juridico/regua" show={Boolean(params.q || params.configuracao)} /></ListTitleBar><ListFiltersForm className="grid-cols-1 md:grid-cols-2 xl:grid-cols-12"><ListSearchField defaultValue={params.q} placeholder="Condomínio, administradora ou carteira..." className="xl:col-span-9" /><ListFilterField label="Situação" className="xl:col-span-2"><Select name="configuracao" defaultValue={params.configuracao ?? ''}><option value="">Todas</option><option value="ativa">Configurada</option><option value="pendente">Não configurada</option></Select></ListFilterField><Button type="submit" className="w-full xl:col-span-1">Filtrar</Button></ListFiltersForm></ListPanelHeader>
        {rows.length ? <div className="divide-y divide-slate-100">{rows.map((row: any) => {
          const extra = row.dias_expiracao_regua_pre_juridico
          const total = Number(row.inicio_cobranca_dias ?? 0) + Number(extra ?? 0)
          const disponiveis = reguas.filter((regua: any) => !regua.carteira_id || regua.carteira_id === row.carteira_id)
          return <details key={row.id} className="group/condominio bg-white"><summary className="flex cursor-pointer list-none items-center justify-between gap-3 bg-slate-50/70 px-4 py-2.5 transition hover:bg-slate-100 [&::-webkit-details-marker]:hidden"><div className="flex min-w-0 items-center gap-3"><ChevronDown size={18} className="shrink-0 text-slate-400 transition-transform group-open/condominio:rotate-180" /><div className="min-w-0"><p className="truncate text-sm font-semibold text-slate-950">{row.nome_operacional || row.nome}</p><p className="mt-0.5 truncate text-xs text-slate-500">{row.administradora || 'Sem administradora'} · {row.carteiras?.nome || 'Sem carteira'}</p></div></div><StatusBadge status={configured(row) ? `D+${total}` : 'desativado'} /></summary><div className="grid gap-4 border-t border-slate-100 px-4 py-3 xl:grid-cols-[120px_140px_130px_minmax(250px,1fr)_auto] xl:items-center">
            <div><p className="text-xs text-slate-400">Início da cobrança</p><p className="mt-1 text-sm font-semibold">D+{Number(row.inicio_cobranca_dias ?? 0)}</p></div>
            <div><p className="text-xs text-slate-400">Expiração adicional</p><p className="mt-1 text-sm font-semibold">{configured(row) ? `${Number(extra)} dias` : 'Não definida'}</p></div>
            <div><p className="text-xs text-slate-400">Entrada prevista</p><div className="mt-1"><StatusBadge status={configured(row) ? `D+${total}` : 'desativado'} /></div></div>
            <form action={vincularReguaPreJuridico} className="flex gap-2"><input type="hidden" name="condominio_id" value={row.id} /><select name="regua_pre_juridico_id" defaultValue={row.regua_pre_juridico_id ?? ''} className="h-9 min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-2 text-xs"><option value="">Automática (carteira/global)</option>{disponiveis.map((regua: any) => <option key={regua.id} value={regua.id}>{regua.nome}</option>)}</select><button className="h-9 rounded-lg border border-violet-200 px-3 text-xs font-medium text-violet-700 hover:bg-violet-50">Salvar</button></form>
            <Link href={`/app/condominios/${row.id}`} className="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-slate-200 px-3 text-xs font-medium text-slate-700 hover:bg-slate-50"><Settings2 size={14} /> Ajustar</Link>
          </div></details>
        })}</div> : <div className="p-8 text-center text-sm text-slate-500">Nenhuma configuração encontrada.</div>}
      </ListPanel>
    </div>
  )
}
