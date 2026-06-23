import { PageHeader } from '@/components/ui/page-header'
import { Card } from '@/components/ui/card'
import { Button, ButtonLink } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { StatusBadge } from '@/components/data/status-badge'
import { EmptyState } from '@/components/data/empty-state'
import { AlertTriangle } from 'lucide-react'
import { getPermittedCarteiras } from '@/utils/auth/get-permitted-carteiras'
import { listReguaAcordoPreview, listReguaCobrancaPreview } from '@/features/regua/queries'
import { gerarLoteReguaAcordos, gerarLoteReguaCobranca } from '@/features/regua/actions'
import { listCarteirasForSelect, listCondominiosForSelect } from '@/features/cadastros/queries'
import { ConfirmGenerateLoteButton } from './confirm-generate-lote-button'

const PREVIEW_LIMIT = 20

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
  const jaGerada = Boolean(row.ja_gerada_no_ciclo)
  const reguaNome = row.regua_preview?.nome ?? 'Padrão interno'
  const reguaOrigem = row.regua_preview?.origem === 'cadastrada' ? 'régua cadastrada' : 'padrão interno'
  const etapa = row.etapa
  const etapaLabel = etapa?.nome ?? `Etapa ${etapa?.ordem ?? '-'}`
  const canal = String(etapa?.canal ?? 'whatsapp').toUpperCase()

  return (
    <div className="grid gap-4 px-5 py-4 xl:grid-cols-[44px_130px_1fr_180px] xl:items-center">
      <div className="flex xl:justify-center">
        {selectionName && selectionValue ? (
          <input
            type="checkbox"
            name={selectionName}
            value={selectionValue}
            defaultChecked={!jaGerada}
            disabled={jaGerada}
            aria-label={`Selecionar ${tipo} da unidade ${unidade}`}
            className="h-4 w-4 rounded border-slate-300 text-[var(--gkli-primary)] focus:ring-[var(--gkli-primary)]"
          />
        ) : null}
      </div>
      <div>
        <StatusBadge status={row.elegivel ? 'elegivel' : 'bloqueada'} />
        {jaGerada ? <p className="mt-2 rounded-full bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-700">já gerado</p> : null}
        <p className="mt-2 text-xs font-medium uppercase text-slate-400">{tipo}</p>
      </div>
      <div>
        <p className="text-sm font-semibold text-slate-950">{condominio} · {unidade}</p>
        <p className="mt-1 line-clamp-2 text-sm text-slate-600">{row.mensagem_preview ?? row.motivo ?? 'Sem prévia disponível.'}</p>
        <p className="mt-2 text-xs text-slate-500">
          {reguaNome} · {reguaOrigem} · {etapaLabel} · {canal}
        </p>
      </div>
      <div className="rounded-lg bg-slate-50 p-3 text-xs text-slate-500">
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
      <input type="hidden" name="regua_id" value={filters.regua_id} />
    </>
  )
}

async function safeLoadSelects<T>(loader: () => Promise<T[]>, label: string) {
  try {
    return { rows: await loader(), error: '' }
  } catch (error) {
    const message = error instanceof Error ? error.message : `Não foi possível carregar ${label}.`
    return { rows: [] as T[], error: message }
  }
}

async function safeLoadPreview<T>(loader: () => Promise<T[]>, label: string) {
  try {
    return { rows: await loader(), error: '' }
  } catch (error) {
    const detail = error instanceof Error ? error.message : `Não foi possível carregar ${label}.`
    return { rows: [] as T[], error: `Prévia de ${label}: ${detail}` }
  }
}

export default async function SimuladorReguaPage({ searchParams }: PageProps) {
  const params = searchParams ? await searchParams : {}
  const filters = {
    q: getParam(params.q),
    carteira_id: getParam(params.carteira_id),
    condominio_id: getParam(params.condominio_id),
    contato: getParam(params.contato) || 'todos',
    regua_id: getParam(params.regua_id),
  }
  const aba = getParam(params.aba) === 'acordos' ? 'acordos' : 'cobrancas'
  const showCobrancas = aba === 'cobrancas'
  const showAcordos = aba === 'acordos'
  const previewFilters = {
    q: filters.q,
    carteiraId: filters.carteira_id,
    condominioId: filters.condominio_id,
    contato: filters.contato,
    reguaId: filters.regua_id,
  }

  let carteiras: any[] = []
  let condominios: any[] = []
  let cobrancas: any[] = []
  let acordos: any[] = []
  let previewError = ''

  try {
    const scope = await getPermittedCarteiras()
    const [carteirasResult, condominiosResult] = await Promise.all([
      safeLoadSelects(() => listCarteirasForSelect(scope), 'carteiras'),
      safeLoadSelects(() => listCondominiosForSelect(scope), 'condomínios'),
    ])
    carteiras = carteirasResult.rows
    condominios = condominiosResult.rows
    const selectErrors = [carteirasResult.error, condominiosResult.error].filter(Boolean)
    previewError = selectErrors.join(' ')

    const [cobrancasResult, acordosResult] = await Promise.all([
      safeLoadPreview(() => listReguaCobrancaPreview(scope, previewFilters), 'cobranças'),
      safeLoadPreview(() => listReguaAcordoPreview(scope, previewFilters), 'acordos'),
    ])
    cobrancas = cobrancasResult.rows
    acordos = acordosResult.rows
    previewError = [
      previewError,
      cobrancasResult.error,
      acordosResult.error,
    ].filter(Boolean).join(' ')
  } catch (error) {
    previewError = error instanceof Error ? error.message : 'Não foi possível carregar a prévia da régua.'
  }

  const cobrancasElegiveis = cobrancas.filter((row: any) => row.elegivel)
  const acordosElegiveis = acordos.filter((row: any) => row.elegivel)
  const cobrancasVisiveis = cobrancasElegiveis.slice(0, PREVIEW_LIMIT)
  const acordosVisiveis = acordosElegiveis.slice(0, PREVIEW_LIMIT)
  const cobrancasGeraveisVisiveis = cobrancasVisiveis.filter((row: any) => !row.ja_gerada_no_ciclo)
  const acordosGeraveisVisiveis = acordosVisiveis.filter((row: any) => !row.ja_gerada_no_ciclo)
  const hasFilters = Boolean(filters.q || filters.carteira_id || filters.condominio_id || filters.contato !== 'todos' || filters.regua_id)

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Motor de cobrança"
        title="Simulador de lotes"
        description={filters.regua_id ? "Prévia específica da régua selecionada antes de gerar o lote." : "Confira quem entrará na régua antes de gerar mensagens reais. É a trava de segurança operacional antes do disparo."}
        actions={<ButtonLink href="/app/mensageria/reguas" variant="header">Painel de réguas</ButtonLink>}
      />

      <div className="grid gap-4 md:grid-cols-4">
        <Card><p className="text-xs font-semibold uppercase text-slate-400">Cobranças</p><p className="mt-3 text-2xl font-semibold text-slate-950">{cobrancasElegiveis.length}</p><p className="mt-1 text-sm text-slate-500">elegíveis de {cobrancas.length}</p></Card>
        <Card><p className="text-xs font-semibold uppercase text-slate-400">Acordos</p><p className="mt-3 text-2xl font-semibold text-slate-950">{acordosElegiveis.length}</p><p className="mt-1 text-sm text-slate-500">elegíveis de {acordos.length}</p></Card>
        <Card><p className="text-xs font-semibold uppercase text-slate-400">Canal</p><p className="mt-3 text-2xl font-semibold text-slate-950">WA</p><p className="mt-1 text-sm text-slate-500">WhatsApp Web por padrão</p></Card>
        <Card><p className="text-xs font-semibold uppercase text-slate-400">Modo</p><p className="mt-3 text-2xl font-semibold text-slate-950">Prévia</p><p className="mt-1 text-sm text-slate-500">sem gravar até gerar lote</p></Card>
      </div>

      <Card className="p-5">
        <form className="grid gap-3 xl:grid-cols-[minmax(220px,1.2fr)_minmax(180px,.8fr)_minmax(220px,1fr)_180px_auto_auto] xl:items-end">
          {filters.regua_id ? <input type="hidden" name="regua_id" value={filters.regua_id} /> : null}
          <label className="space-y-1.5">
            <span className="text-xs font-semibold uppercase text-slate-400">Busca</span>
            <Input name="q" defaultValue={filters.q} placeholder="Responsável, unidade ou condomínio" />
          </label>
          <label className="space-y-1.5">
            <span className="text-xs font-semibold uppercase text-slate-400">Carteira</span>
            <Select name="carteira_id" defaultValue={filters.carteira_id}>
              <option value="">Todas</option>
              {carteiras.map((carteira: any) => <option key={carteira.id} value={carteira.id}>{carteira.nome}</option>)}
            </Select>
          </label>
          <label className="space-y-1.5">
            <span className="text-xs font-semibold uppercase text-slate-400">Condomínio</span>
            <Select name="condominio_id" defaultValue={filters.condominio_id}>
              <option value="">Todos</option>
              {condominios.map((condominio: any) => <option key={condominio.id} value={condominio.id}>{condominio.nome}</option>)}
            </Select>
          </label>
          <label className="space-y-1.5">
            <span className="text-xs font-semibold uppercase text-slate-400">Contato</span>
            <Select name="contato" defaultValue={filters.contato}>
              <option value="todos">Todos</option>
              <option value="com_destinatario">Com destinatário</option>
              <option value="sem_destinatario">Sem destinatário</option>
            </Select>
          </label>
          <Button type="submit">Filtrar</Button>
          {hasFilters ? <ButtonLink href="/app/mensageria/simulador" variant="secondary" className="h-10">Limpar</ButtonLink> : null}
        </form>
      </Card>

      <div className="flex flex-wrap gap-2">
        <TabLink href={simulatorHref(filters, 'cobrancas')} active={showCobrancas} label="Cobranças" count={cobrancasElegiveis.length} />
        <TabLink href={simulatorHref(filters, 'acordos')} active={showAcordos} label="Acordos" count={acordosElegiveis.length} />
      </div>

      {previewError ? (
        <Card className="border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <p className="font-semibold">Não foi possível carregar a prévia desta aba.</p>
              <p className="mt-1">{previewError}</p>
            </div>
          </div>
        </Card>
      ) : null}

      {showCobrancas ? (
        <Card className="p-0">
          <form action={gerarLoteReguaCobranca}>
            <HiddenFilters filters={filters} />
            <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
              <div>
                <h2 className="text-sm font-semibold text-slate-950">Cobranças elegíveis</h2>
                <p className="mt-1 text-xs text-slate-500">
                  Gerar lote usa somente os itens visíveis e selecionados nesta tela.
                </p>
              </div>
              <ConfirmGenerateLoteButton itemCount={cobrancasGeraveisVisiveis.length} tipo="cobrancas">Gerar lote</ConfirmGenerateLoteButton>
            </div>
            {cobrancasElegiveis.length > PREVIEW_LIMIT ? (
              <div className="border-b border-amber-100 bg-amber-50 px-5 py-3 text-xs text-amber-800">
                Mostrando os primeiros {PREVIEW_LIMIT} de {cobrancasElegiveis.length} itens elegíveis. Refine os filtros para gerar lotes menores e controlados.
              </div>
            ) : null}
            <div className="divide-y divide-slate-100">
              {cobrancasElegiveis.length === 0 ? <div className="p-5"><EmptyState title="Sem cobranças elegíveis" description="Nada para gerar neste momento." /></div> : cobrancasVisiveis.map((row: any) => <PreviewRow key={itemKey('c', row)} row={row} tipo="cobranca" selectionName="cobranca_ids" selectionValue={row.id} />)}
            </div>
          </form>
        </Card>
      ) : null}

      {showAcordos ? (
        <Card className="p-0">
          <form action={gerarLoteReguaAcordos}>
            <HiddenFilters filters={filters} />
            <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
              <div>
                <h2 className="text-sm font-semibold text-slate-950">Acordos elegíveis</h2>
                <p className="mt-1 text-xs text-slate-500">
                  Gerar lote usa somente os itens visíveis e selecionados nesta tela.
                </p>
              </div>
              <ConfirmGenerateLoteButton itemCount={acordosGeraveisVisiveis.length} tipo="acordos">Gerar lote</ConfirmGenerateLoteButton>
            </div>
            {acordosElegiveis.length > PREVIEW_LIMIT ? (
              <div className="border-b border-amber-100 bg-amber-50 px-5 py-3 text-xs text-amber-800">
                Mostrando os primeiros {PREVIEW_LIMIT} de {acordosElegiveis.length} itens elegíveis. Refine os filtros para gerar lotes menores e controlados.
              </div>
            ) : null}
            <div className="divide-y divide-slate-100">
              {acordosElegiveis.length === 0 ? <div className="p-5"><EmptyState title="Sem acordos elegíveis" description="Nenhuma parcela exige contato agora." /></div> : acordosVisiveis.map((row: any) => <PreviewRow key={itemKey('a', row)} row={row} tipo="acordo" selectionName="parcela_ids" selectionValue={row.parcela?.id ?? ''} />)}
            </div>
          </form>
        </Card>
      ) : null}
    </div>
  )
}

