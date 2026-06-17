import { PageHeader } from '@/components/ui/page-header'
import { Card } from '@/components/ui/card'
import { Button, ButtonLink } from '@/components/ui/button'
import { StatusBadge } from '@/components/data/status-badge'
import { EmptyState } from '@/components/data/empty-state'
import { getPermittedCarteiras } from '@/utils/auth/get-permitted-carteiras'
import { listReguaAcordoPreview, listReguaCobrancaPreview } from '@/features/regua/queries'
import { gerarLoteReguaAcordos, gerarLoteReguaCobranca } from '@/features/regua/actions'
import { listCarteirasForSelect, listCondominiosForSelect } from '@/features/cadastros/queries'

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}

function getParam(value: string | string[] | undefined) {
  return String(Array.isArray(value) ? value[0] : value ?? '').trim()
}

function simulatorHref(filters: Record<string, string>, aba: 'cobrancas' | 'acordos') {
  const query = new URLSearchParams()
  query.set('aba', aba)

  for (const [key, value] of Object.entries(filters)) {
    if (value && !(key === 'contato' && value === 'todos')) query.set(key, value)
  }

  return `/app/mensageria/simulador?${query.toString()}`
}

function TabLink({
  href,
  active,
  label,
  count,
}: {
  href: string
  active: boolean
  label: string
  count: number
}) {
  return (
    <ButtonLink
      href={href}
      variant={active ? 'primary' : 'secondary'}
      className="min-w-[150px] justify-center"
    >
      {label}
      <span className={active ? 'text-white/80' : 'text-slate-400'}>{count}</span>
    </ButtonLink>
  )
}

function itemKey(prefix: string, row: any) {
  return `${prefix}-${row.id}-${row.parcela?.id ?? 'principal'}`
}

function PreviewRow({
  row,
  tipo,
  selectionName,
  selectionValue,
}: {
  row: any
  tipo: 'cobranca' | 'acordo'
  selectionName?: string
  selectionValue?: string
}) {
  const unidade = row.unidades?.identificacao ?? row.unidade?.identificacao ?? 'Unidade'
  const condominio = row.condominios?.nome ?? row.condominio?.nome ?? 'Condomínio'
  const destinatario = row.destinatario_preview || 'sem destinatário'

  return (
    <div className="grid gap-4 px-5 py-4 xl:grid-cols-[44px_130px_1fr_180px] xl:items-center">
      <div className="flex xl:justify-center">
        {selectionName && selectionValue ? (
          <input
            type="checkbox"
            name={selectionName}
            value={selectionValue}
            defaultChecked
            aria-label={`Selecionar ${tipo} da unidade ${unidade}`}
            className="h-4 w-4 rounded border-slate-300 text-[var(--gkli-primary)] focus:ring-[var(--gkli-primary)]"
          />
        ) : null}
      </div>
      <div>
        <StatusBadge status={row.elegivel ? 'elegivel' : 'bloqueada'} />
        <p className="mt-2 text-xs uppercase tracking-[0.18em] text-slate-400">{tipo}</p>
      </div>
      <div>
        <p className="text-sm font-semibold text-slate-950">{condominio} · {unidade}</p>
        <p className="mt-1 line-clamp-2 text-sm text-slate-600">{row.mensagem_preview ?? row.motivo ?? 'Sem prévia disponível.'}</p>
      </div>
      <div className="rounded-2xl bg-slate-50 p-3 text-xs text-slate-500">
        <p className="font-semibold text-slate-700">Destinatário</p>
        <p className="mt-1 break-all">{destinatario}</p>
      </div>
    </div>
  )
}
function HiddenFilters({ filters }: { filters: Record<string, string> }) {
  return (
    <>
      <input type="hidden" name="selection_enabled" value="1" />
      <input type="hidden" name="q" value={filters.q} />
      <input type="hidden" name="carteira_id" value={filters.carteira_id} />
      <input type="hidden" name="condominio_id" value={filters.condominio_id} />
      <input type="hidden" name="contato" value={filters.contato} />
    </>
  )
}

export default async function SimuladorReguaPage({ searchParams }: PageProps) {
  const scope = await getPermittedCarteiras()
  const params = searchParams ? await searchParams : {}
  const filters = {
    q: getParam(params.q),
    carteira_id: getParam(params.carteira_id),
    condominio_id: getParam(params.condominio_id),
    contato: getParam(params.contato) || 'todos',
  }
  const aba = getParam(params.aba) === 'acordos' ? 'acordos' : 'cobrancas'
  const previewFilters = {
    q: filters.q,
    carteiraId: filters.carteira_id,
    condominioId: filters.condominio_id,
    contato: filters.contato,
  }

  const [cobrancas, acordos, carteiras, condominios] = await Promise.all([
    listReguaCobrancaPreview(scope, previewFilters),
    listReguaAcordoPreview(scope, previewFilters),
    listCarteirasForSelect(scope),
    listCondominiosForSelect(scope),
  ])

  const cobrancasElegiveis = cobrancas.filter((row: any) => row.elegivel)
  const acordosElegiveis = acordos.filter((row: any) => row.elegivel)
  const hasFilters = Boolean(filters.q || filters.carteira_id || filters.condominio_id || filters.contato !== 'todos')
  const showCobrancas = aba === 'cobrancas'
  const showAcordos = aba === 'acordos'

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Motor de cobrança"
        title="Simulador de lotes"
        description="Confira quem entrará na régua antes de gerar mensagens reais. É a trava de segurança operacional antes do disparo."
        actions={<ButtonLink href="/app/mensageria/reguas" variant="header">Painel de réguas</ButtonLink>}
      />

      <div className="grid gap-4 md:grid-cols-4">
        <Card><p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">Cobranças</p><p className="mt-3 text-3xl font-semibold text-slate-950">{cobrancasElegiveis.length}</p><p className="mt-1 text-sm text-slate-500">elegíveis de {cobrancas.length}</p></Card>
        <Card><p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">Acordos</p><p className="mt-3 text-3xl font-semibold text-slate-950">{acordosElegiveis.length}</p><p className="mt-1 text-sm text-slate-500">elegíveis de {acordos.length}</p></Card>
        <Card><p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">Canal</p><p className="mt-3 text-3xl font-semibold text-slate-950">WA</p><p className="mt-1 text-sm text-slate-500">WhatsApp Web por padrão</p></Card>
        <Card><p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">Modo</p><p className="mt-3 text-3xl font-semibold text-slate-950">Prévia</p><p className="mt-1 text-sm text-slate-500">sem gravar até gerar lote</p></Card>
      </div>

      <Card className="p-5">
        <form className="grid gap-3 xl:grid-cols-[minmax(220px,1.2fr)_minmax(180px,.8fr)_minmax(220px,1fr)_180px_auto_auto] xl:items-end">
          <label className="space-y-1.5">
            <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Busca</span>
            <input name="q" defaultValue={filters.q} placeholder="Responsável, unidade ou condomínio" className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-[var(--gkli-primary)]" />
          </label>
          <label className="space-y-1.5">
            <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Carteira</span>
            <select name="carteira_id" defaultValue={filters.carteira_id} className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-[var(--gkli-primary)]">
              <option value="">Todas</option>
              {carteiras.map((carteira: any) => <option key={carteira.id} value={carteira.id}>{carteira.nome}</option>)}
            </select>
          </label>
          <label className="space-y-1.5">
            <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Condomínio</span>
            <select name="condominio_id" defaultValue={filters.condominio_id} className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-[var(--gkli-primary)]">
              <option value="">Todos</option>
              {condominios.map((condominio: any) => <option key={condominio.id} value={condominio.id}>{condominio.nome}</option>)}
            </select>
          </label>
          <label className="space-y-1.5">
            <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Contato</span>
            <select name="contato" defaultValue={filters.contato} className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-[var(--gkli-primary)]">
              <option value="todos">Todos</option>
              <option value="com_destinatario">Com destinatário</option>
              <option value="sem_destinatario">Sem destinatário</option>
            </select>
          </label>
          <button className="h-10 rounded-xl bg-slate-950 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800">Filtrar</button>
          {hasFilters ? <ButtonLink href="/app/mensageria/simulador" variant="secondary" className="h-10">Limpar</ButtonLink> : null}
        </form>
      </Card>

      <div className="flex flex-wrap gap-2">
        <TabLink href={simulatorHref(filters, 'cobrancas')} active={showCobrancas} label="Cobranças" count={cobrancasElegiveis.length} />
        <TabLink href={simulatorHref(filters, 'acordos')} active={showAcordos} label="Acordos" count={acordosElegiveis.length} />
      </div>

      {showCobrancas ? (
        <Card className="p-0">
          <form action={gerarLoteReguaCobranca}>
            <HiddenFilters filters={filters} />
            <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
              <div><h2 className="text-sm font-semibold text-slate-950">Cobranças elegíveis</h2><p className="mt-1 text-xs text-slate-500">Apenas cobranças que já passaram pela janela D+ configurada.</p></div>
              <Button type="submit">Gerar lote</Button>
            </div>
            <div className="divide-y divide-slate-100">
              {cobrancasElegiveis.length === 0 ? <div className="p-5"><EmptyState title="Sem cobranças elegíveis" description="Nada para gerar neste momento." /></div> : cobrancasElegiveis.slice(0, 20).map((row: any) => <PreviewRow key={itemKey('c', row)} row={row} tipo="cobranca" selectionName="cobranca_ids" selectionValue={row.id} />)}
            </div>
          </form>
        </Card>
      ) : null}

      {showAcordos ? (
        <Card className="p-0">
          <form action={gerarLoteReguaAcordos}>
            <HiddenFilters filters={filters} />
            <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
              <div><h2 className="text-sm font-semibold text-slate-950">Acordos elegíveis</h2><p className="mt-1 text-xs text-slate-500">Parcelas em janela preventiva ou vencidas.</p></div>
              <Button type="submit">Gerar lote</Button>
            </div>
            <div className="divide-y divide-slate-100">
              {acordosElegiveis.length === 0 ? <div className="p-5"><EmptyState title="Sem acordos elegíveis" description="Nenhuma parcela exige contato agora." /></div> : acordosElegiveis.slice(0, 20).map((row: any) => <PreviewRow key={itemKey('a', row)} row={row} tipo="acordo" selectionName="parcela_ids" selectionValue={row.parcela?.id ?? ''} />)}
            </div>
          </form>
        </Card>
      ) : null}
    </div>
  )
}

