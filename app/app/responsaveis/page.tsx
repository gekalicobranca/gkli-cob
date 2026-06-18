import Link from 'next/link'
import { Edit3, Plus, UsersRound } from 'lucide-react'
import { PageHeader } from '@/components/ui/page-header'
import { Card } from '@/components/ui/card'
import { Button, ButtonLink } from '@/components/ui/button'
import { Select } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import {
  ClearFiltersLink,
  ListEmptyState,
  ListFilterField,
  ListFiltersForm,
  ListKpiGrid,
  ListPage,
  ListPanel,
  ListPanelHeader,
  ListRow,
  ListRows,
  ListSearchField,
  ListTitle,
  ListTitleBar,
} from '@/components/layout/list-page'
import { getPermittedCarteiras } from '@/utils/auth/get-permitted-carteiras'
import { listCarteirasForSelect, listCondominiosForSelect } from '@/features/cadastros/queries'
import {
  hasResponsavelUnidadeFilters,
  listResponsaveisUnidades,
  normalizeResponsavelUnidadeFilters,
} from '@/features/responsaveis-unidades/queries'

type ResponsaveisPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}

function getParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value
}

function normalizeText(value: unknown) {
  return String(value ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

function sortResponsaveis(rows: any[], ordenar: string) {
  const field = ordenar || 'condominio'
  return [...rows].sort((a, b) => {
    const getValue = (row: any) => {
      if (field === 'unidade') return normalizeText(row.unidade)
      if (field === 'responsavel') return normalizeText(row.responsavel_nome)
      if (field === 'tipo') return normalizeText(row.tipo_responsavel)
      if (field === 'status') return row.ativo === false ? '1' : '0'
      if (field === 'carteira') return normalizeText(row.carteiras?.nome)
      return normalizeText(row.condominios?.nome)
    }
    return getValue(a).localeCompare(getValue(b), 'pt-BR', { numeric: true })
  })
}

function tipoLabel(value?: string | null) {
  if (value === 'proprietario') return 'Proprietário'
  if (value === 'inquilino') return 'Inquilino'
  return 'Não informado'
}

function completenessLabel(row: any) {
  const missing = [
    !row.responsavel_nome ? 'nome' : null,
    !row.responsavel_documento ? 'documento' : null,
    !row.telefone ? 'telefone' : null,
    !row.email ? 'e-mail' : null,
  ].filter(Boolean)

  if (missing.length === 0) return 'Completo'
  return `${missing.length} pendência${missing.length > 1 ? 's' : ''}`
}

export default async function ResponsaveisPage({ searchParams }: ResponsaveisPageProps) {
  const params = await searchParams
  const scope = await getPermittedCarteiras()

  const filters = normalizeResponsavelUnidadeFilters({
    search: getParam(params?.q),
    carteiraId: getParam(params?.carteira_id),
    condominioId: getParam(params?.condominio_id),
    contato: getParam(params?.contato),
    ativo: getParam(params?.ativo),
    tipoResponsavel: getParam(params?.tipo_responsavel),
  })

  const [rowsBase, carteiras, condominios] = await Promise.all([
    listResponsaveisUnidades(scope, filters),
    listCarteirasForSelect(scope),
    listCondominiosForSelect(scope),
  ])

  const ordenar = getParam(params?.ordenar) ?? 'condominio'
  const rows = sortResponsaveis(rowsBase, ordenar)
  const filtrosAtivos = hasResponsavelUnidadeFilters(filters) || ordenar !== 'condominio'
  const ativos = rows.filter((row: any) => row.ativo !== false).length
  const proprietarios = rows.filter((row: any) => row.tipo_responsavel === 'proprietario').length
  const inquilinos = rows.filter((row: any) => row.tipo_responsavel === 'inquilino').length
  const incompletos = rows.filter((row: any) => !row.responsavel_nome || !row.responsavel_documento || !row.telefone || !row.email).length

  return (
    <ListPage>
      <PageHeader
        eyebrow="Base Cadastral"
        title="Responsáveis"
        description="Índice dos responsáveis por unidade. Dados pessoais ficam no cadastro individual."
        actions={<ButtonLink href="/app/responsaveis/novo"><Plus size={16} />Novo responsável</ButtonLink>}
      />

      <ListKpiGrid className="md:grid-cols-4 xl:grid-cols-4">
        <Card className="relative overflow-hidden p-3">
          <div className="absolute right-4 top-3 rounded-lg bg-[var(--gkli-primary-light)] p-2 text-[var(--gkli-primary)]">
            <UsersRound size={18} />
          </div>
          <p className="text-xs font-medium uppercase text-slate-400">Ativos</p>
          <p className="mt-1.5 text-2xl font-semibold text-slate-950">{ativos}</p>
        </Card>
        <Card className="p-3">
          <p className="text-xs font-medium uppercase text-slate-400">Proprietários</p>
          <p className="mt-1.5 text-2xl font-semibold text-slate-950">{proprietarios}</p>
        </Card>
        <Card className="p-3">
          <p className="text-xs font-medium uppercase text-slate-400">Inquilinos</p>
          <p className="mt-1.5 text-2xl font-semibold text-slate-950">{inquilinos}</p>
        </Card>
        <Card className="p-3">
          <p className="text-xs font-medium uppercase text-slate-400">Incompletos</p>
          <p className="mt-1.5 text-2xl font-semibold text-slate-950">{incompletos}</p>
        </Card>
      </ListKpiGrid>

      <ListPanel>
        <ListPanelHeader>
          <ListTitleBar>
            <ListTitle
              title="Cadastros de responsáveis"
              description="Abra o cadastro para visualizar ou alterar documento, telefone, e-mail e observações."
            />
            <ClearFiltersLink href="/app/responsaveis" show={filtrosAtivos} />
          </ListTitleBar>

          <ListFiltersForm className="xl:grid-cols-[minmax(240px,1.2fr)_minmax(170px,.8fr)_minmax(210px,1fr)_150px_160px_170px_180px_auto]">
            <ListSearchField
              placeholder="Condomínio, unidade, responsável ou contato"
              defaultValue={filters.search ?? ''}
            />
            <ListFilterField label="Carteira">
              <Select name="carteira_id" defaultValue={filters.carteiraId ?? ''}>
                <option value="">Todas</option>
                {carteiras.map((carteira: any) => (
                  <option key={carteira.id} value={carteira.id}>{carteira.nome}</option>
                ))}
              </Select>
            </ListFilterField>
            <ListFilterField label="Condomínio">
              <Select name="condominio_id" defaultValue={filters.condominioId ?? ''}>
                <option value="">Todos</option>
                {condominios.map((condominio: any) => (
                  <option key={condominio.id} value={condominio.id}>{condominio.nome}</option>
                ))}
              </Select>
            </ListFilterField>
            <ListFilterField label="Status">
              <Select name="ativo" defaultValue={filters.ativo ?? ''}>
                <option value="">Todos</option>
                <option value="ativo">Ativos</option>
                <option value="inativo">Inativos</option>
              </Select>
            </ListFilterField>
            <ListFilterField label="Contato">
              <Select name="contato" defaultValue={filters.contato ?? ''}>
                <option value="">Todos</option>
                <option value="sem_telefone">Sem telefone</option>
                <option value="sem_email">Sem e-mail</option>
                <option value="incompleto">Cadastro incompleto</option>
              </Select>
            </ListFilterField>
            <ListFilterField label="Tipo">
              <Select name="tipo_responsavel" defaultValue={filters.tipoResponsavel ?? ''}>
                <option value="">Todos</option>
                <option value="proprietario">Proprietário</option>
                <option value="inquilino">Inquilino</option>
                <option value="nao_informado">Não informado</option>
              </Select>
            </ListFilterField>
            <ListFilterField label="Ordenar por">
              <Select name="ordenar" defaultValue={ordenar}>
                <option value="condominio">Condomínio</option>
                <option value="unidade">Unidade</option>
                <option value="responsavel">Responsável</option>
                <option value="tipo">Tipo</option>
                <option value="status">Status</option>
                <option value="carteira">Carteira</option>
              </Select>
            </ListFilterField>
            <Button type="submit">Filtrar</Button>
          </ListFiltersForm>
        </ListPanelHeader>

        {rows.length === 0 ? (
          <ListEmptyState
            title="Nenhum responsável encontrado"
            description="Ajuste os filtros ou cadastre um responsável de apoio para enriquecer futuras importações."
          />
        ) : (
          <ListRows>
            {rows.map((row: any) => {
              const href = `/app/responsaveis/${row.id}`
              const completo = completenessLabel(row) === 'Completo'
              return (
                <ListRow
                  key={row.id}
                  className="xl:grid-cols-[minmax(240px,1.2fr)_150px_170px_150px_130px_120px]"
                >
                  <Link href={href} className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-950">{row.condominios?.nome ?? '-'}</p>
                    <p className="mt-1 truncate text-xs text-slate-500">{row.carteiras?.nome ?? '-'} - origem {row.origem ?? '-'}</p>
                  </Link>
                  <Link href={href} className="min-w-0 text-sm text-slate-700">
                    <span className="block truncate">Bloco {row.bloco || '-'}</span>
                    <span className="mt-1 block truncate text-xs text-slate-500">Unidade {row.unidade || '-'}</span>
                  </Link>
                  <Link href={href} className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-950">{row.responsavel_nome || 'Responsável não informado'}</p>
                    <p className="mt-1 text-xs text-slate-500">{tipoLabel(row.tipo_responsavel)}</p>
                  </Link>
                  <div className="flex flex-wrap gap-2">
                    <Badge tone={row.ativo !== false ? 'green' : 'slate'}>{row.ativo !== false ? 'Ativo' : 'Inativo'}</Badge>
                    <Badge tone={completo ? 'green' : 'yellow'}>{completenessLabel(row)}</Badge>
                  </div>
                  <p className="text-xs text-slate-500">
                    Atualizado em {row.updated_at ? new Intl.DateTimeFormat('pt-BR').format(new Date(row.updated_at)) : '-'}
                  </p>
                  <ButtonLink href={href} variant="secondary" size="sm">
                    <Edit3 size={14} />
                    Editar
                  </ButtonLink>
                </ListRow>
              )
            })}
          </ListRows>
        )}
      </ListPanel>
    </ListPage>
  )
}
