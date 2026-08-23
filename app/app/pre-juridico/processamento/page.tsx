import { ClipboardCheck, FileText, Hourglass, Scale } from 'lucide-react'
import { ProcessamentoEtapas } from '@/components/pre-juridico/processamento-etapas'
import { IniciarProcessamento } from '@/components/pre-juridico/iniciar-processamento'
import { Card } from '@/components/ui/card'
import { PageHeader } from '@/components/ui/page-header'
import { ClearFiltersLink, ListFilterField, ListFiltersForm, ListPanel, ListPanelHeader, ListSearchField, ListTitle, ListTitleBar } from '@/components/layout/list-page'
import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/select'
import { listPreJuridicoCasos, listPreJuridicoCobrancas } from '@/features/pre-juridico/queries'
import { getPermittedCarteiras } from '@/utils/auth/get-permitted-carteiras'

type Params = Promise<{ q?: string; carteira_id?: string; condominio_id?: string; etapa?: string }>
const PREPARACAO = ['aguardando_documentos', 'aguardando_sindico', 'aguardando_administradora', 'pronto_juridico'] as const
const norm = (value: unknown) => String(value ?? '').trim().toLocaleLowerCase('pt-BR')
const relation = (value: any) => Array.isArray(value) ? value[0] : value
const option = (id: unknown, nome: unknown): [string, string] => [String(id ?? ''), String(nome ?? '')]

export default async function ProcessamentoPreJuridicoPage({ searchParams }: { searchParams: Params }) {
  const params = await searchParams
  const scope = await getPermittedCarteiras()
  const [cobrancas, casos] = await Promise.all([listPreJuridicoCobrancas(scope), listPreJuridicoCasos(scope)])
  const casoPorCobranca = new Map(casos.filter((caso: any) => caso.cobranca_id).map((caso: any) => [caso.cobranca_id, caso]))
  const encaminhadas = cobrancas.filter((row: any) => row.situacao_pre_juridico === 'encaminhado')
  const aguardandoInicio = encaminhadas.filter((row: any) => !casoPorCobranca.has(row.id)).filter((row: any) => {
    if (params.etapa && params.etapa !== 'aguardando_inicio') return false
    if (params.carteira_id && row.carteira_id !== params.carteira_id) return false
    if (params.condominio_id && row.condominio_id !== params.condominio_id) return false
    return !params.q || norm([row.condominio?.nome, row.condominio?.nome_operacional, row.unidade?.identificacao, row.unidade?.responsavel_nome].join(' ')).includes(norm(params.q))
  })
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

  return <div className="space-y-5">
    <PageHeader eyebrow="Pré-Jurídico" title="Processamento" description="Prepare os documentos, obtenha a procuração assinada pelo síndico e só então encaminhe à administradora." />
    <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
      <Card className="p-4"><Hourglass size={19} className="text-amber-600" /><p className="mt-3 text-2xl font-semibold">{aguardandoInicio.length}</p><p className="text-sm text-slate-500">aguardando início</p></Card>
      <Card className="p-4"><FileText size={19} className="text-slate-600" /><p className="mt-3 text-2xl font-semibold">{emPreparacao.filter((row: any) => row.etapa === 'aguardando_documentos').length}</p><p className="text-sm text-slate-500">em documentos</p></Card>
      <Card className="p-4"><ClipboardCheck size={19} className="text-orange-600" /><p className="mt-3 text-2xl font-semibold">{emPreparacao.filter((row: any) => ['aguardando_administradora', 'aguardando_sindico'].includes(row.etapa)).length}</p><p className="text-sm text-slate-500">em validação</p></Card>
      <Card className="p-4"><Scale size={19} className="text-emerald-600" /><p className="mt-3 text-2xl font-semibold">{emPreparacao.filter((row: any) => row.etapa === 'pronto_juridico').length}</p><p className="text-sm text-slate-500">prontas para envio</p></Card>
    </section>
    <ListPanel>
      <ListPanelHeader className="bg-white/80">
        <ListTitleBar className="xl:items-center"><ListTitle title="Processamentos" description="Localize por carteira, condomínio, etapa, unidade ou responsável." /><ClearFiltersLink href="/app/pre-juridico/processamento" show={hasFilters} /></ListTitleBar>
        <ListFiltersForm className="grid-cols-1 md:grid-cols-2 xl:grid-cols-12">
          <ListSearchField defaultValue={params.q} placeholder="Unidade ou responsável..." className="xl:col-span-4" />
          <ListFilterField label="Carteira" className="xl:col-span-2"><Select name="carteira_id" defaultValue={params.carteira_id ?? ''}><option value="">Todas</option>{carteiras.map(([id, nome]) => <option key={String(id)} value={String(id)}>{String(nome || 'Sem nome')}</option>)}</Select></ListFilterField>
          <ListFilterField label="Condomínio" className="xl:col-span-3"><Select name="condominio_id" defaultValue={params.condominio_id ?? ''}><option value="">Todos</option>{condominios.map(([id, nome]) => <option key={String(id)} value={String(id)}>{String(nome || 'Sem nome')}</option>)}</Select></ListFilterField>
          <ListFilterField label="Etapa" className="xl:col-span-2"><Select name="etapa" defaultValue={params.etapa ?? ''}><option value="">Todas</option><option value="aguardando_inicio">Aguardando início</option><option value="aguardando_documentos">Documentos</option><option value="aguardando_sindico">Síndico</option><option value="aguardando_administradora">Administradora</option><option value="pronto_juridico">Pronto para o jurídico</option></Select></ListFilterField>
          <Button type="submit" className="w-full xl:col-span-1">Filtrar</Button>
        </ListFiltersForm>
      </ListPanelHeader>
    </ListPanel>
    <ListPanel><ListPanelHeader><ListTitle title="Aguardando início" description="Cobranças encaminhadas que ainda não possuem um andamento operacional." /></ListPanelHeader><IniciarProcessamento rows={aguardandoInicio as any[]} /></ListPanel>
    <ListPanel><ListPanelHeader><ListTitle title="Etapas de preparação" description="Fluxo obrigatório: Documentos → procuração assinada pelo Síndico → validação da Administradora → Pronto para o jurídico." /></ListPanelHeader><div className="p-4"><ProcessamentoEtapas casos={emPreparacao as any[]} etapas={PREPARACAO} /></div></ListPanel>
  </div>
}
