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
    status: getParam(params.status),
    escopo: getParam(params.escopo),
  }
  const templates = templatesBase.filter((template: any) => matchesTemplateFilters(template, filters))
  const hasFilters = Object.values(filters).some(Boolean)

  const ativos = templates.filter((template: any) => template.ativo).length
  const cobranca = templates.filter((template: any) => (template.tipo_regua ?? template.tipo) === 'cobranca').length
  const acordo = templates.filter((template: any) => (template.tipo_regua ?? template.tipo) === 'acordo').length
  const globais = templates.filter((template: any) => !template.carteira_id).length

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Mensageria"
        title="Templates"
        description="Modelos oficiais usados pelas réguas, lotes e mensagens renderizadas. O histórico salva snapshot do texto gerado."
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
          <p className="mt-1 text-sm text-slate-500">disponíveis para régua</p>
        </Card>
        <Card>
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-400">Cobrança</p>
          <p className="mt-3 text-3xl font-semibold text-slate-950">{cobranca}</p>
          <p className="mt-1 text-sm text-slate-500">modelos de cobrança</p>
        </Card>
        <Card>
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-400">Acordo</p>
          <p className="mt-3 text-3xl font-semibold text-slate-950">{acordo}</p>
          <p className="mt-1 text-sm text-slate-500">modelos de acordo</p>
        </Card>
        <Card>
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-400">Globais</p>
          <p className="mt-3 text-3xl font-semibold text-slate-950">{globais}</p>
          <p className="mt-1 text-sm text-slate-500">visíveis para todas as carteiras</p>
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
        <ListFiltersForm className="xl:grid-cols-[minmax(230px,1.2fr)_140px_190px_140px_130px_130px_130px_auto]">
          <ListSearchField
            defaultValue={filters.q}
            placeholder="Nome, assunto, conteúdo ou carteira"
          />
          <ListFilterField label="Tipo">
            <Select name="tipo" defaultValue={filters.tipo}>
              <option value="">Todos</option>
              <option value="cobranca">Cobrança</option>
              <option value="acordo">Acordo</option>
            </Select>
          </ListFilterField>
          <ListFilterField label="Categoria">
            <Select name="categoria" defaultValue={filters.categoria}>
              <option value="">Todas</option>
              {TEMPLATE_CATEGORIES.map((categoria) => (
                <option key={categoria} value={categoria}>{categoryLabel(categoria)}</option>
              ))}
            </Select>
          </ListFilterField>
          <ListFilterField label="Intensidade">
            <Select name="intensidade" defaultValue={filters.intensidade}>
              <option value="">Todas</option>
              {TEMPLATE_INTENSITIES.map((intensidade) => (
                <option key={intensidade} value={intensidade}>{intensityLabel(intensidade)}</option>
              ))}
            </Select>
          </ListFilterField>
          <ListFilterField label="Canal">
            <Select name="canal" defaultValue={filters.canal}>
              <option value="">Todos</option>
              {TEMPLATE_CHANNELS.map((canal) => (
                <option key={canal} value={canal}>{canal}</option>
              ))}
            </Select>
          </ListFilterField>
          <ListFilterField label="Status">
            <Select name="status" defaultValue={filters.status}>
              <option value="">Todos</option>
              <option value="ativo">Ativos</option>
              <option value="inativo">Inativos</option>
            </Select>
          </ListFilterField>
          <ListFilterField label="Escopo">
            <Select name="escopo" defaultValue={filters.escopo}>
              <option value="">Todos</option>
              <option value="global">Globais</option>
              <option value="carteira">Carteira</option>
            </Select>
          </ListFilterField>
          <Button type="submit">Filtrar</Button>
        </ListFiltersForm>
      </Card>

      {templates.length === 0 ? (
        <EmptyState title="Nenhum template encontrado" description={hasFilters ? 'Ajuste os filtros para ampliar a busca.' : 'Crie o primeiro modelo para alimentar a régua de mensagens.'} />
      ) : (
        <Card className="overflow-hidden p-0">
          <div className="border-b border-slate-100 px-5 py-4">
            <h2 className="text-sm font-semibold text-slate-950">Biblioteca de templates</h2>
            <p className="mt-1 text-xs text-slate-500">Clique em um template para editar conteúdo, canal, tipo e preview.</p>
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
                  <div>{badge(template.carteira_id ? String(template.carteira_nome ?? 'Carteira específica') : 'Global', template.carteira_id ? 'blue' : 'green')}</div>
                  <div>{badge(categoryLabel(template.categoria ?? template.tipo), (template.tipo_regua ?? template.tipo) === 'acordo' ? 'amber' : 'blue')}</div>
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
