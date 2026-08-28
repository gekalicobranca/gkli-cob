import { WalletCards } from 'lucide-react'
import { PageHeader } from '@/components/ui/page-header'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { CondominioSearchSelect } from '@/components/gestao/condominio-search-select'
import { ClearFiltersLink, ListCollapsibleFilters, ListFilterField, ListFiltersForm, ListKpiGrid, ListSearchField } from '@/components/layout/list-page'
import { PreJuridicoCobrancasWorkbench } from '@/components/pre-juridico/cobrancas-workbench'
import { listCarteirasForSelect, listCondominiosForSelect } from '@/features/cadastros/queries'
import { listPreJuridicoCobrancas } from '@/features/pre-juridico/queries'
import { getPermittedCarteiras } from '@/utils/auth/get-permitted-carteiras'
import { formatCurrency } from '@/utils/formatters/currency'

type Params = Promise<{ q?: string; carteira_id?: string; condominio_id?: string; vencimento_de?: string; vencimento_ate?: string; etapa?: string }>

function normalize(value: unknown) {
  return String(value ?? '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

function dateFilter(value: unknown) {
  const normalized = String(value ?? '').trim()
  return /^\d{4}-\d{2}-\d{2}$/.test(normalized) ? normalized : ''
}

export default async function PreJuridicoPage({ searchParams }: { searchParams: Params }) {
  const params = await searchParams
  const scope = await getPermittedCarteiras()
  const [baseRows, carteiras, condominiosCadastrados] = await Promise.all([
    listPreJuridicoCobrancas(scope),
    listCarteirasForSelect(scope),
    listCondominiosForSelect(scope),
  ])
  const termo = normalize(params.q)
  const vencimentoDe = dateFilter(params.vencimento_de)
  const vencimentoAte = dateFilter(params.vencimento_ate)
  const filteredScope = baseRows.filter((row: any) => {
    if (params.carteira_id && row.carteira_id !== params.carteira_id) return false
    if (vencimentoDe && String(row.vencimento ?? '') < vencimentoDe) return false
    if (vencimentoAte && String(row.vencimento ?? '') > vencimentoAte) return false
    return true
  })
  const condominios = condominiosCadastrados
    .filter((row: any) => !params.carteira_id || row.carteira_id === params.carteira_id)
    .map((row: any) => ({ id: row.id, nome: row.nome || 'Condomínio não informado', administradora: null }))
    .sort((a: any, b: any) => a.nome.localeCompare(b.nome, 'pt-BR'))
  const rows = filteredScope.filter((row: any) => {
    if (params.condominio_id && row.condominio_id !== params.condominio_id) return false
    if (params.etapa && row.situacao_pre_juridico !== params.etapa) return false
    if (!termo) return true
    return normalize([row.condominio?.nome, row.condominio?.nome_operacional, row.unidade?.identificacao, row.unidade?.responsavel_nome].filter(Boolean).join(' ')).includes(termo)
  })
  const elegiveis = filteredScope.filter((row: any) => row.situacao_pre_juridico === 'elegivel')
  const encaminhadas = filteredScope.filter((row: any) => row.situacao_pre_juridico === 'encaminhado')
  const valorElegivel = elegiveis.reduce((sum: number, row: any) => sum + Number(row.valor_atualizado ?? row.valor_original ?? 0), 0)
  const unidades = new Set(filteredScope.map((row: any) => row.unidade_id).filter(Boolean)).size
  const hasFilters = Boolean(params.q || params.carteira_id || params.condominio_id || params.vencimento_de || params.vencimento_ate || params.etapa)

  return (
    <div className="space-y-5">
      <PageHeader eyebrow="Pré-Jurídico" title="Painel pré-jurídico" description="Revise cobranças que atingiram a regra de vencimento e encaminhe cada uma individualmente ao pré-jurídico." />
      <ListKpiGrid>
        <Card className="relative overflow-hidden p-3">
          <div className="absolute right-4 top-3 rounded-lg bg-[var(--gkli-primary-light)] p-2 text-[var(--gkli-primary)]"><WalletCards size={18} /></div>
          <p className="text-xs font-medium uppercase text-slate-400">Valor elegível</p>
          <p className="mt-1.5 text-2xl font-semibold text-slate-950">{formatCurrency(valorElegivel)}</p>
        </Card>
        {[
          ['Elegíveis', elegiveis.length, 'aguardando', 'bg-emerald-50 text-emerald-700'],
          ['Encaminhadas', encaminhadas.length, 'pré-jurídico', 'bg-violet-50 text-violet-700'],
          ['Unidades', unidades, 'no recorte', 'bg-blue-50 text-blue-700'],
        ].map(([title, value, tag, tagClass]) => (
          <Card key={title} className="p-3">
            <p className="text-xs font-medium uppercase text-slate-400">{title}</p>
            <div className="mt-1.5 flex items-end justify-between gap-3">
              <p className="text-2xl font-semibold text-slate-950">{value}</p>
              <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${tagClass}`}>{tag}</span>
            </div>
          </Card>
        ))}
      </ListKpiGrid>
      <ListCollapsibleFilters defaultOpen={hasFilters} actions={<ClearFiltersLink href="/app/pre-juridico" show={hasFilters} />}>
        <ListFiltersForm className="grid-cols-1 md:grid-cols-2 xl:grid-cols-12">
          <ListSearchField defaultValue={params.q} placeholder="Unidade ou responsável..." className="xl:col-span-3" />
          <ListFilterField label="Carteira" className="xl:col-span-2"><Select name="carteira_id" defaultValue={params.carteira_id ?? ''}><option value="">Todas</option>{carteiras.map((carteira: any) => <option key={carteira.id} value={carteira.id}>{carteira.nome}</option>)}</Select></ListFilterField>
          <ListFilterField label="Condomínio" className="xl:col-span-3"><CondominioSearchSelect name="condominio_id" options={condominios as any[]} selectedId={params.condominio_id ?? ''} defaultToFirst={false} inputClassName="" /></ListFilterField>
          <ListFilterField label="Vencimento de" className="xl:col-span-2"><Input name="vencimento_de" type="date" defaultValue={vencimentoDe} /></ListFilterField>
          <ListFilterField label="Vencimento até" className="xl:col-span-2"><Input name="vencimento_ate" type="date" defaultValue={vencimentoAte} /></ListFilterField>
          <ListFilterField label="Situação" className="xl:col-span-2"><Select name="etapa" defaultValue={params.etapa ?? ''}><option value="">Todas</option><option value="elegivel">Elegíveis</option><option value="encaminhado">Encaminhadas</option></Select></ListFilterField>
          <Button type="submit" className="w-full xl:col-span-1">Filtrar</Button>
        </ListFiltersForm>
      </ListCollapsibleFilters>
      <PreJuridicoCobrancasWorkbench rows={rows as any[]} />
    </div>
  )
}
