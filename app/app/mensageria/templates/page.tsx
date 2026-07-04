import Link from 'next/link'
import { PageHeader } from '@/components/ui/page-header'
import { Card } from '@/components/ui/card'
import { Button, ButtonLink } from '@/components/ui/button'
import { Select } from '@/components/ui/select'
import { EmptyState } from '@/components/data/empty-state'
import {
  ClearFiltersLink,
  ListFilterField,
  ListFiltersForm,
  ListSearchField,
  ListTitle,
  ListTitleBar,
} from '@/components/layout/list-page'
import { getPermittedCarteiras } from '@/utils/auth/get-permitted-carteiras'
import { listTemplates } from '@/features/mensageria/queries'
import {
  categoryLabel,
  intensityLabel,
  renderTemplate,
  SAMPLE_TEMPLATE_VARIABLES,
  TEMPLATE_CATEGORIES,
  TEMPLATE_CHANNELS,
  TEMPLATE_INTENSITIES,
} from '@/features/mensageria/render-template'

type TemplatesPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}

function getParam(value: string | string[] | undefined) {
  return String(Array.isArray(value) ? value[0] : value ?? '').trim()
}

function normalizeText(value: unknown) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

function getTemplateTipo(template: any) {
  return template.tipo_regua ?? template.tipo ?? ''
}

function matchesTemplateFilters(template: any, filters: Record<string, string>) {
  const q = normalizeText(filters.q)
  const tipo = getTemplateTipo(template)
  const haystack = normalizeText([
    template.nome,
    template.codigo,
    template.categoria,
    template.assunto,
    template.conteudo,
    template.carteira_nome,
  ].filter(Boolean).join(' '))

  if (q && !haystack.includes(q)) return false
  if (filters.tipo && tipo !== filters.tipo) return false
  if (filters.categoria && (template.categoria ?? template.tipo) !== filters.categoria) return false
  if (filters.intensidade && template.intensidade !== filters.intensidade) return false
  if (filters.canal && template.canal !== filters.canal) return false
  if (filters.status === 'ativo' && !template.ativo) return false
  if (filters.status === 'inativo' && template.ativo) return false
  if (filters.escopo === 'global' && template.carteira_id) return false
  if (filters.escopo === 'carteira' && !template.carteira_id) return false
  return true
}

function badge(label: string, tone = 'slate') {
  const tones: Record<string, string> = {
    slate: 'bg-slate-100 text-slate-700 ring-slate-200',
    green: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
    amber: 'bg-amber-50 text-amber-700 ring-amber-200',
    blue: 'bg-sky-50 text-sky-700 ring-sky-200',
  }

  return <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${tones[tone] ?? tones.slate}`}>{label}</span>
}

export default async function TemplatesMensageriaPage({ searchParams }: TemplatesPageProps) {
  const params = searchParams ? await searchParams : {}
  const scope = await getPermittedCarteiras()
  const templatesBase = await listTemplates(scope)
  const filters = {
    q: getParam(params.q),
    tipo: getParam(params.tipo),
    categoria: getParam(params.categoria),
    intensidade: getParam(params.intensidade),
    canal: getParam(params.canal),
    status: params.status === undefined ? 'ativo' : getParam(params.status),
    escopo: getParam(params.escopo),
  }
  const templates = templatesBase.filter((template: any) => matchesTemplateFilters(template, filters))
  const hasFilters = Object.entries(filters).some(([key, value]) => Boolean(value) && !(key === 'status' && value === 'ativo'))

  const ativos = templates.filter((template: any) => template.ativo).length
  const cobranca = templates.filter((template: any) => (template.tipo_regua ?? template.tipo) === 'cobranca').length
  const acordo = templates.filter((template: any) => (template.tipo_regua ?? template.tipo) === 'acordo').length
  const juridico = templates.filter((template: any) => (template.tipo_regua ?? template.tipo) === 'juridico').length
  const globais = templates.filter((template: any) => !template.carteira_id).length

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Mensageria"
        title="Templates"
        description="Modelos oficiais usados pelas rÃ©guas, lotes e mensagens renderizadas. O histÃ³rico salva snapshot do texto gerado."
        actions={<ButtonLink href="/app/mensageria/templates/novo" variant="header">Novo template</ButtonLink>}
      />

      <div className="grid gap-4 md:grid-cols-5">
        <Card>
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-400">Templates</p>
          <p className="mt-3 text-3xl font-semibold text-slate-950">{templates.length}</p>
          <p className="mt-1 text-sm text-slate-500">modelos cadastrados</p>
        </Card>
        <Card>
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-400">Ativos</p>
          <p className="mt-3 text-3xl font-semibold text-slate-950">{ativos}</p>
          <p className="mt-1 text-sm text-slate-500">disponÃ­veis para rÃ©gua</p>
        </Card>
        <Card>
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-400">CobranÃ§a</p>
          <p className="mt-3 text-3xl font-semibold text-slate-950">{cobranca}</p>
          <p className="mt-1 text-sm text-slate-500">modelos de cobranÃ§a</p>
        </Card>
        <Card>
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-400">Acordo</p>
          <p className="mt-3 text-3xl font-semibold text-slate-950">{acordo}</p>
          <p className="mt-1 text-sm text-slate-500">modelos de acordo</p>
        </Card>
        <Card>
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-400">Jurídico</p>
          <p className="mt-3 text-3xl font-semibold text-slate-950">{juridico}</p>
          <p className="mt-1 text-sm text-slate-500">{globais} modelo(s) global(is)</p>
        </Card>
      </div>

      <Card className="p-5">
        <ListTitleBar>
          <ListTitle
            title="Filtros"
            description="Localize modelos por texto, tipo, canal, status ou escopo."
          />
          <ClearFiltersLink href="/app/mensageria/templates" show={hasFilters} />
        </ListTitleBar>
        <ListFiltersForm className="grid-cols-1 md:grid-cols-2 xl:grid-cols-12">
          <ListSearchField
            defaultValue={filters.q}
            placeholder="Nome, assunto, conteÃºdo ou carteira"
            className="xl:col-span-4"
          />
          <ListFilterField label="Tipo" className="xl:col-span-2">
            <Select name="tipo" defaultValue={filters.tipo}>
              <option value="">Todos</option>
              <option value="cobranca">CobranÃ§a</option>
              <option value="acordo">Acordo</option>
              <option value="juridico">Jurídico</option>
            </Select>
          </ListFilterField>
          <ListFilterField label="Categoria" className="xl:col-span-3">
            <Select name="categoria" defaultValue={filters.categoria}>
              <option value="">Todas</option>
              {TEMPLATE_CATEGORIES.map((categoria) => (
                <option key={categoria} value={categoria}>{categoryLabel(categoria)}</option>
              ))}
            </Select>
          </ListFilterField>
          <ListFilterField label="Intensidade" className="xl:col-span-2">
            <Select name="intensidade" defaultValue={filters.intensidade}>
              <option value="">Todas</option>
              {TEMPLATE_INTENSITIES.map((intensidade) => (
                <option key={intensidade} value={intensidade}>{intensityLabel(intensidade)}</option>
              ))}
            </Select>
          </ListFilterField>
          <ListFilterField label="Canal" className="xl:col-span-2">
            <Select name="canal" defaultValue={filters.canal}>
              <option value="">Todos</option>
              {TEMPLATE_CHANNELS.map((canal) => (
                <option key={canal} value={canal}>{canal}</option>
              ))}
            </Select>
          </ListFilterField>
          <ListFilterField label="Status" className="xl:col-span-2">
            <Select name="status" defaultValue={filters.status}>
              <option value="">Todos</option>
              <option value="ativo">Ativos</option>
              <option value="inativo">Inativos</option>
            </Select>
          </ListFilterField>
          <ListFilterField label="Escopo" className="xl:col-span-2">
            <Select name="escopo" defaultValue={filters.escopo}>
              <option value="">Todos</option>
              <option value="global">Globais</option>
              <option value="carteira">Carteira</option>
            </Select>
          </ListFilterField>
          <Button type="submit" className="w-full xl:col-span-1">
            Filtrar
          </Button>
        </ListFiltersForm>
      </Card>

      {templates.length === 0 ? (
        <EmptyState title="Nenhum template encontrado" description={hasFilters ? 'Ajuste os filtros para ampliar a busca.' : 'Crie o primeiro modelo para alimentar a rÃ©gua de mensagens.'} />
      ) : (
        <Card className="overflow-hidden p-0">
          <div className="border-b border-slate-100 px-5 py-4">
            <h2 className="text-sm font-semibold text-slate-950">Biblioteca de templates</h2>
            <p className="mt-1 text-xs text-slate-500">Clique em um template para editar conteÃºdo, canal, tipo e preview.</p>
          </div>

          <div className="divide-y divide-slate-100">
            {templates.map((template: any) => {
              const preview = renderTemplate(template.conteudo ?? '', SAMPLE_TEMPLATE_VARIABLES)
              return (
                <Link
                  key={template.id}
                  href={`/app/mensageria/templates/${template.id}`}
                  className="grid gap-4 px-5 py-4 transition hover:bg-slate-50 xl:grid-cols-[1fr_150px_150px_110px_110px_110px_90px] xl:items-center"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-950">{template.nome}</p>
                    <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500">{preview || template.conteudo}</p>
                  </div>
                  <div>{badge(template.carteira_id ? String(template.carteira_nome ?? 'Carteira especÃ­fica') : 'Global', template.carteira_id ? 'blue' : 'green')}</div>
                  <div>{badge(categoryLabel(template.categoria ?? template.tipo), (template.tipo_regua ?? template.tipo) === 'acordo' ? 'amber' : (template.tipo_regua ?? template.tipo) === 'juridico' ? 'green' : 'blue')}</div>
                  <div>{badge(intensityLabel(template.intensidade), template.intensidade === 'agressivo' ? 'amber' : 'slate')}</div>
                  <div>{badge(String(template.canal ?? 'whatsapp'))}</div>
                  <div>{badge(template.ativo ? 'ativo' : 'inativo', template.ativo ? 'green' : 'slate')}</div>
                  <div className="text-sm text-slate-500 xl:text-right">P{template.prioridade ?? 0}</div>
                </Link>
              )
            })}
          </div>
        </Card>
      )}
    </div>
  )
}

