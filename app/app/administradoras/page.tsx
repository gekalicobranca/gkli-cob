import Link from 'next/link'
import { ArrowUpRight, Building2, Filter, Plus } from 'lucide-react'
import { PageHeader } from '@/components/ui/page-header'
import { Card } from '@/components/ui/card'
import { Button, ButtonLink } from '@/components/ui/button'
import { Select } from '@/components/ui/select'
import { StatusBadge } from '@/components/data/status-badge'
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
import { listAdministradoras, normalizeAdmFilters } from '@/features/administradoras/queries'

type Props = { searchParams?: Promise<Record<string, string | string[] | undefined>> }

function getParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value
}

function normalizeText(value: unknown) {
  return String(value ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

function filterAdministradoras(
  rows: Awaited<ReturnType<typeof listAdministradoras>>,
  params: Record<string, string | string[] | undefined> | undefined,
) {
  const acessoAcordo = getParam(params?.acesso_acordo)
  if (!acessoAcordo) return rows
  return rows.filter((row) => (acessoAcordo === 'sim' ? row.acesso_gerar_acordo : !row.acesso_gerar_acordo))
}

function sortAdministradoras(rows: Awaited<ReturnType<typeof listAdministradoras>>, ordenar: string) {
  const field = ordenar || 'nome'
  return [...rows].sort((a, b) => {
    const getValue = (row: any) => {
      if (field === 'status') return normalizeText(row.status)
      if (field === 'acesso_acordo') return row.acesso_gerar_acordo ? '0' : '1'
      if (field === 'contato') return normalizeText(row.email ?? row.telefone)
      return normalizeText(row.nome_operacional || row.nome)
    }
    return getValue(a).localeCompare(getValue(b), 'pt-BR', { numeric: true })
  })
}

export default async function AdministradorasPage({ searchParams }: Props) {
  const params = await searchParams
  const filters = normalizeAdmFilters({ search: getParam(params?.q), status: getParam(params?.status) })
  const ordenar = getParam(params?.ordenar) ?? 'nome'
  const rows = sortAdministradoras(filterAdministradoras(await listAdministradoras(filters), params), ordenar)
  const ativas = rows.filter((row) => row.status !== 'inativo').length
  const filtrosAtivos = Boolean(filters.search || filters.status || getParam(params?.acesso_acordo) || ordenar !== 'nome')

  return (
    <ListPage>
      <PageHeader
        eyebrow="Administradoras"
        title="Cadastro de administradoras"
        description="Controle global das administradoras, seus contatos e a operação externa que destrava planilhas, boletos e registros de acordo."
        actions={<ButtonLink href="/app/administradoras/nova"><Plus size={16} />Nova administradora</ButtonLink>}
      />

      <ListKpiGrid className="md:grid-cols-3 xl:grid-cols-3">
        <Card className="p-3">
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">Total</p>
          <p className="mt-1.5 text-2xl font-semibold text-slate-950">{rows.length}</p>
        </Card>
        <Card className="p-3">
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">Ativas</p>
          <p className="mt-1.5 text-2xl font-semibold text-slate-950">{ativas}</p>
        </Card>
        <Card className="p-3">
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">Hub externo</p>
          <p className="mt-1.5 text-2xl font-semibold text-slate-950">ADM</p>
        </Card>
      </ListKpiGrid>

      <ListPanel>
        <ListPanelHeader>
          <ListTitleBar>
            <ListTitle
              title="Base de administradoras"
              description="Busque por nome, CNPJ ou e-mail. Este cadastro é global e não depende de carteira."
            />
            <ClearFiltersLink href="/app/administradoras" show={filtrosAtivos} />
          </ListTitleBar>

          <ListFiltersForm className="md:grid-cols-[minmax(220px,1fr)_160px_180px_190px_auto] md:items-end">
            <ListSearchField defaultValue={filters.search ?? ''} placeholder="Nome, CNPJ ou e-mail" />
            <ListFilterField label="Status">
              <Select name="status" defaultValue={filters.status ?? ''}>
                <option value="">Todos</option>
                <option value="ativo">Ativo</option>
                <option value="inativo">Inativo</option>
              </Select>
            </ListFilterField>
            <ListFilterField label="Acesso acordos">
              <Select name="acesso_acordo" defaultValue={getParam(params?.acesso_acordo) ?? ''}>
                <option value="">Todos</option>
                <option value="sim">Liberado</option>
                <option value="nao">Sem acesso</option>
              </Select>
            </ListFilterField>
            <ListFilterField label="Ordenar por">
              <Select name="ordenar" defaultValue={ordenar}>
                <option value="nome">Nome</option>
                <option value="status">Status</option>
                <option value="acesso_acordo">Acesso acordos</option>
                <option value="contato">Contato</option>
              </Select>
            </ListFilterField>
            <Button type="submit"><Filter size={16} />Filtrar</Button>
          </ListFiltersForm>
        </ListPanelHeader>

        {rows.length === 0 ? (
          <ListEmptyState
            title="Nenhuma administradora encontrada"
            description="Cadastre a primeira administradora para começar a controlar contatos, planilhas e boletos."
          />
        ) : (
          <ListRows>
            {rows.map((row) => (
              <ListRow
                key={row.id}
                className="xl:grid-cols-[minmax(260px,1.4fr)_150px_minmax(180px,.8fr)_minmax(220px,1fr)_150px]"
              >
                <Link href={`/app/administradoras/${row.id}`} className="group min-w-0">
                  <p className="truncate text-sm font-medium text-slate-950 group-hover:text-[var(--gkli-primary)]">
                    <Building2 size={16} className="mr-2 inline text-slate-400" />
                    {row.nome_operacional || row.nome}
                  </p>
                  <p className="mt-1 truncate text-xs text-slate-500">
                    Razão: {row.nome} · CNPJ {row.cnpj ?? '-'} · Resp. {row.responsavel_interno ?? '-'}
                  </p>
                </Link>
                <StatusBadge status={row.status ?? 'ativo'} />
                <div>
                  <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">Acordos</p>
                  <p className={row.acesso_gerar_acordo ? 'mt-1 text-sm font-medium text-emerald-700' : 'mt-1 text-sm text-slate-500'}>
                    {row.acesso_gerar_acordo ? 'Acesso liberado' : 'Sem acesso'}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">Contato geral</p>
                  <p className="mt-1 truncate text-sm text-slate-700">{row.email ?? row.telefone ?? '-'}</p>
                </div>
                <div className="flex justify-start xl:justify-end">
                  <ButtonLink href={`/app/administradoras/${row.id}`} size="sm" variant="secondary">
                    <ArrowUpRight size={15} />
                    Abrir
                  </ButtonLink>
                </div>
              </ListRow>
            ))}
          </ListRows>
        )}
      </ListPanel>
    </ListPage>
  )
}
