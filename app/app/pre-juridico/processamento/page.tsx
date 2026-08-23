import { ClipboardCheck, FileText, Hourglass, Scale } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { ProcessamentoEtapas } from '@/components/pre-juridico/processamento-etapas'
import { IniciarProcessamento } from '@/components/pre-juridico/iniciar-processamento'
import { Card } from '@/components/ui/card'
import { PageHeader } from '@/components/ui/page-header'
import { ClearFiltersLink, ListFilterField, ListFiltersForm, ListKpiGrid, ListPage, ListPanel, ListPanelHeader, ListSearchField, ListTitle, ListTitleBar } from '@/components/layout/list-page'
import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/select'
import { listPreJuridicoCasos, listPreJuridicoCobrancas } from '@/features/pre-juridico/queries'
import { getPermittedCarteiras } from '@/utils/auth/get-permitted-carteiras'

type Params = Promise<{ q?: string; carteira_id?: string; condominio_id?: string; etapa?: string }>
const PREPARACAO = ['aguardando_documentos', 'aguardando_sindico', 'confirmar_juridico', 'pronto_juridico'] as const
const norm = (value: unknown) => String(value ?? '').trim().toLocaleLowerCase('pt-BR')
const relation = (value: any) => Array.isArray(value) ? value[0] : value
const option = (id: unknown, nome: unknown): [string, string] => [String(id ?? ''), String(nome ?? '')]

export default async function ProcessamentoPreJuridicoPage({ searchParams }: { searchParams: Params }) {
  const params = await searchParams
  const scope = await getPermittedCarteiras()
  const [cobrancas, casos] = await Promise.all([listPreJuridicoCobrancas(scope), listPreJuridicoCasos(scope)])
  const unidadesComCaso = new Set(casos.map((caso: any) => caso.unidade_id).filter(Boolean))
  const encaminhadas = cobrancas.filter((row: any) => row.situacao_pre_juridico === 'encaminhado')
  const aguardandoInicioFiltradas = encaminhadas.filter((row: any) => !unidadesComCaso.has(row.unidade_id)).filter((row: any) => {
    if (params.etapa && params.etapa !== 'aguardando_inicio') return false
    if (params.carteira_id && row.carteira_id !== params.carteira_id) return false
    if (params.condominio_id && row.condominio_id !== params.condominio_id) return false
    return !params.q || norm([row.condominio?.nome, row.condominio?.nome_operacional, row.unidade?.identificacao, row.unidade?.responsavel_nome].join(' ')).includes(norm(params.q))
  })
  const aguardandoInicio = Array.from(aguardandoInicioFiltradas.reduce((groups: Map<string, any>, row: any) => {
    const key = row.unidade_id || row.id
    const current = groups.get(key)
    if (!current) groups.set(key, { ...row, quantidade_cobrancas: row.quantidade_cobrancas_unidade ?? 1, valor_unidade: Number(row.valor_cobrancas_unidade ?? row.valor_atualizado ?? row.valor_original ?? 0) })
    return groups
  }, new Map()).values())
  const emPreparacao = casos.filter((caso: any) => PREPARACAO.includes(caso.etapa)).filter((caso: any) => {
    if (params.etapa && caso.etapa !== params.etapa) return false
    if (params.carteira_id && caso.carteira_id !== params.carteira_id) return false
    if (params.condominio_id && caso.condominio_id !== params.condominio_id) return false
    if (!params.q) return true
    const condominio = relation(caso.condominio), unidade = relation(caso.unidade)
    return norm([condominio?.nome, condominio?.nome_operacional, unidade?.identificacao, unidade?.responsavel_nome].join(' ')).includes(norm(params.q))
  })
  const carteiras = Array.from(new Map([
    ...encaminhadas.map((row: any) => option(row.carteira_id, row.carteira?.nome)),
    ...casos.map((row: any) => option(row.carteira_id, relation(row.carteira)?.nome)),
  ].filter(([id]) => id)).entries()).sort((a, b) => String(a[1]).localeCompare(String(b[1]), 'pt-BR'))
  const condominios = Array.from(new Map([
    ...encaminhadas.map((row: any) => option(row.condominio_id, row.condominio?.nome_operacional || row.condominio?.nome)),
    ...casos.map((row: any) => option(row.condominio_id, relation(row.condominio)?.nome_operacional || relation(row.condominio)?.nome)),
  ].filter(([id]) => id)).entries()).sort((a, b) => String(a[1]).localeCompare(String(b[1]), 'pt-BR'))
  const hasFilters = Boolean(params.q || params.carteira_id || params.condominio_id || params.etapa)
  const kpis: Array<{ label: string; value: number; icon: LucideIcon; tone: string }> = [
    { label: 'Aguardando início', value: aguardandoInicio.length, icon: Hourglass, tone: 'bg-amber-50 text-amber-700' },
    { label: 'Confirmar propriedade', value: emPreparacao.filter((row: any) => row.etapa === 'aguardando_documentos').length, icon: FileText, tone: 'bg-slate-100 text-slate-700' },
    { label: 'Em validação', value: emPreparacao.filter((row: any) => ['confirmar_juridico', 'aguardando_sindico'].includes(row.etapa)).length, icon: ClipboardCheck, tone: 'bg-orange-50 text-orange-700' },
    { label: 'Prontas para envio', value: emPreparacao.filter((row: any) => row.etapa === 'pronto_juridico').length, icon: Scale, tone: 'bg-emerald-50 text-emerald-700' },
  ]

  return <ListPage>
    <PageHeader eyebrow="Pré-Jurídico" title="Processamento" description="Confirme a propriedade, obtenha a procuração assinada e valide o recebimento pelo jurídico." />
    <ListKpiGrid>
      {kpis.map(({ label, value, icon: Icon, tone }) => <Card key={label} className="relative overflow-hidden p-3"><div className={`absolute right-4 top-3 rounded-lg p-2 ${tone}`}><Icon size={18} /></div><p className="text-xs font-medium uppercase text-slate-400">{label}</p><p className="mt-1.5 text-2xl font-semibold text-slate-950">{value}</p></Card>)}
    </ListKpiGrid>
    <ListPanel>
      <ListPanelHeader className="bg-white/80">
        <ListTitleBar className="xl:items-center"><ListTitle title="Processamentos" description="Localize por carteira, condomínio, etapa, unidade ou responsável." /><ClearFiltersLink href="/app/pre-juridico/processamento" show={hasFilters} /></ListTitleBar>
        <ListFiltersForm className="grid-cols-1 md:grid-cols-2 xl:grid-cols-12">
          <ListSearchField defaultValue={params.q} placeholder="Unidade ou responsável..." className="xl:col-span-4" />
          <ListFilterField label="Carteira" className="xl:col-span-2"><Select name="carteira_id" defaultValue={params.carteira_id ?? ''}><option value="">Todas</option>{carteiras.map(([id, nome]) => <option key={String(id)} value={String(id)}>{String(nome || 'Sem nome')}</option>)}</Select></ListFilterField>
          <ListFilterField label="Condomínio" className="xl:col-span-3"><Select name="condominio_id" defaultValue={params.condominio_id ?? ''}><option value="">Todos</option>{condominios.map(([id, nome]) => <option key={String(id)} value={String(id)}>{String(nome || 'Sem nome')}</option>)}</Select></ListFilterField>
          <ListFilterField label="Etapa" className="xl:col-span-2"><Select name="etapa" defaultValue={params.etapa ?? ''}><option value="">Todas</option><option value="aguardando_inicio">Aguardando início</option><option value="aguardando_documentos">Confirmar propriedade</option><option value="aguardando_sindico">Procuração</option><option value="confirmar_juridico">Confirmar jurídico</option><option value="pronto_juridico">Pronto para o jurídico</option></Select></ListFilterField>
          <Button type="submit" className="w-full xl:col-span-1">Filtrar</Button>
        </ListFiltersForm>
      </ListPanelHeader>
    </ListPanel>
    <IniciarProcessamento rows={aguardandoInicio as any[]} />
    <ProcessamentoEtapas casos={emPreparacao as any[]} etapas={PREPARACAO} />
  </ListPage>
}
