import { PageHeader } from '@/components/ui/page-header'
import { Button, ButtonLink } from '@/components/ui/button'
import { SearchableSelect } from '@/components/ui/searchable-select'
import { CondominioSearchSelect } from '@/components/gestao/condominio-search-select'
import { StatusBadge } from '@/components/data/status-badge'
import { Select } from '@/components/ui/select'
import { RESPONSAVEL_LABELS, type ClassificacaoResponsavel } from '@/lib/core/unidades-duplicadas'
import { ListPage, ListPanel, ListPanelHeader, ListFiltersForm, ListFilterField, ListSearchField, ListEmptyState, ListPagination } from '@/components/layout/list-page'
import { getPermittedCarteiras } from '@/utils/auth/get-permitted-carteiras'
import { listCarteirasForSelect, listCondominiosForSelect } from '@/features/cadastros/queries'
import { listUnidadesDuplicadas, type UnidadeComparacao } from '@/features/unidades/duplicadas'

const text = (value: unknown) => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value)?.trim() ?? ''

function Cadastro({ row }: { row: UnidadeComparacao }) {
  return <div className="min-w-0 rounded-lg border border-slate-200 p-4">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <strong>Unidade {row.identificacao} · {row.bloco ? `Bloco ${row.bloco}` : 'Sem bloco'}</strong>
      <StatusBadge status={row.status} />
    </div>
    <p className="mt-2 text-sm">{row.responsavel_nome || 'Responsável não informado'}</p>
    <p className="break-words text-sm text-slate-600">{row.responsavel_documento || 'Documento não informado'} · {row.telefone || 'Sem telefone'} · {row.email || 'Sem e-mail'}</p>
    <div className="mt-3"><ButtonLink href={`/app/unidades/${row.id}`} variant="secondary" size="sm">Abrir cadastro</ButtonLink></div>
  </div>
}

export default async function UnidadesDuplicadasPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams
  const scope = await getPermittedCarteiras()
  const carteiraId = first(params.carteira_id), condominioId = first(params.condominio_id), q = first(params.q)
  const categorias = Object.keys(RESPONSAVEL_LABELS) as ClassificacaoResponsavel[]
  const responsavelParam = first(params.responsavel)
  const responsavelFiltro = categorias.includes(responsavelParam as ClassificacaoResponsavel) ? responsavelParam as ClassificacaoResponsavel : ''
  const requestedPage = Number(first(params.page))
  const page = Number.isSafeInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1
  const [result, carteiras, condominios] = await Promise.all([
    listUnidadesDuplicadas(scope, { carteiraId, condominioId }).then(data => ({ ...data, error: '' })).catch(() => ({ analisadas: 0, pares: [], error: 'Não foi possível analisar as unidades. Tente novamente.' })),
    listCarteirasForSelect(scope), listCondominiosForSelect(scope),
  ])
  // Filtrar depois de comparar preserva o outro cadastro do par.
  const terms = text(q).split(/\s+/).filter(Boolean)
  const encontrados = result.pares.filter(({ a, b }) => {
    const searchable = text([a, b].map(row => [row.identificacao, row.bloco, row.responsavel_nome, row.responsavel_documento, row.telefone, row.email, row.condominios?.nome].join(' ')).join(' '))
    return terms.every(term => searchable.includes(term))
  }).sort((left, right) => (left.a.condominios?.nome ?? '').localeCompare(right.a.condominios?.nome ?? '', 'pt-BR') || left.a.identificacao.localeCompare(right.a.identificacao, 'pt-BR', { numeric: true }))
  const pares = encontrados.filter(par => !responsavelFiltro || par.responsavel.classificacao === responsavelFiltro)
    .sort((a, b) => categorias.indexOf(a.responsavel.classificacao) - categorias.indexOf(b.responsavel.classificacao))
  const pageSize = 25
  const href = (next: number, categoria = responsavelFiltro) => `/app/unidades/duplicadas?${new URLSearchParams({ q, carteira_id: carteiraId, condominio_id: condominioId, responsavel: categoria, page: String(next) })}`
  const visiveis = pares.slice((page - 1) * pageSize, page * pageSize)
  return <ListPage>
    <PageHeader eyebrow="Base Cadastral" title="Possíveis unidades duplicadas" description="Compara unidades do mesmo condomínio, reconhecendo zeros à esquerda, máscaras e aliases de bloco. Blocos diferentes e números sem evidência do bloco não são combinados. Nenhum cadastro é alterado automaticamente." actions={<ButtonLink href="/app/unidades" variant="secondary">Voltar às unidades</ButtonLink>} />
    <ListPanel>
      <ListPanelHeader>
        <ListFiltersForm className="grid-cols-1 md:grid-cols-2">
          <ListSearchField defaultValue={q} placeholder="Unidade, condomínio, responsável ou contato" />
          <ListFilterField label="Carteira"><SearchableSelect name="carteira_id" options={carteiras.map(row => ({ value: row.id, label: row.nome }))} selectedValue={carteiraId} placeholder="Todas as carteiras" /></ListFilterField>
          <ListFilterField label="Condomínio"><CondominioSearchSelect name="condominio_id" options={condominios.map(row => ({ id: row.id, nome: row.nome, administradora: null }))} selectedId={condominioId} defaultToFirst={false} /></ListFilterField>
          <ListFilterField label="Comparação do responsável"><Select key={responsavelFiltro} name="responsavel" defaultValue={responsavelFiltro}>
            <option value="">Todos</option>
            {categorias.map(categoria => <option key={categoria} value={categoria}>{RESPONSAVEL_LABELS[categoria]}</option>)}
          </Select></ListFilterField>
          <div className="flex items-end gap-2"><Button type="submit">Buscar duplicadas</Button><ButtonLink href="/app/unidades/duplicadas" variant="secondary">Limpar</ButtonLink></div>
        </ListFiltersForm>
        {!result.error && <p className="mt-4 text-sm text-slate-600">{result.analisadas} unidades analisadas em todos os status · {pares.length} pares para revisão. Contatos iguais, sozinhos, não indicam duplicidade.</p>}
        {!result.error && <>
          <p className="mt-2 text-sm text-slate-600">CPF/CNPJ completos prevalecem sobre o nome, ignorando a máscara. Sem documento comparável, usamos o nome sem acentos, pontuação ou diferenças de maiúsculas. A comparação não valida a situação fiscal nem os dígitos verificadores. Divergências e correspondências somente por nome exigem revisão.</p>
          <nav aria-label="Separar pares por responsável" className="mt-4 flex flex-wrap gap-2">
            <ButtonLink href={href(1, '')} variant={responsavelFiltro === '' ? 'primary' : 'secondary'}>Todos ({encontrados.length})</ButtonLink>
            {categorias.map(categoria => <ButtonLink key={categoria} href={href(1, categoria)} variant={responsavelFiltro === categoria ? 'primary' : 'secondary'}>
              {RESPONSAVEL_LABELS[categoria]} ({encontrados.filter(par => par.responsavel.classificacao === categoria).length})
            </ButtonLink>)}
          </nav>
        </>}
      </ListPanelHeader>
      {result.error ? <ListEmptyState title="Falha na análise" description={result.error} /> : pares.length === 0 ? <ListEmptyState title="Nenhuma duplicata encontrada" description="Não foram encontrados pares pelos critérios desta análise. Ajuste os filtros para ampliar a busca." /> : <div className="divide-y divide-slate-200">
        {categorias.map(categoria => {
          const grupo = visiveis.filter(par => par.responsavel.classificacao === categoria)
          if (!grupo.length) return null
          return <section key={categoria} aria-label={RESPONSAVEL_LABELS[categoria]}>
            <h2 className="bg-slate-100 px-4 py-3 font-semibold">{RESPONSAVEL_LABELS[categoria]}</h2>
            {grupo.map(({ a, b, motivo, responsavel }) => <section key={`${a.id}:${b.id}`} className="border-t border-slate-200 p-4">
          <h3 className="font-semibold">{a.condominios?.nome || 'Condomínio'}</h3>
          <p className="mb-3 text-sm text-slate-600">{motivo}</p>
          <p className="mb-2 text-sm font-medium">{responsavel.motivo}</p>
          <p className="mb-3 text-sm text-slate-600">Nome: {responsavel.nome === 'igual' ? 'igual' : responsavel.nome === 'diferente' ? 'diferente' : 'sem dados para comparar'} · CPF/CNPJ: {responsavel.documento === 'igual' ? 'igual' : responsavel.documento === 'diferente' ? 'diferente' : 'sem dados completos para comparar'}</p>
          <div className="grid gap-3 lg:grid-cols-2"><Cadastro row={a} /><Cadastro row={b} /></div>
            </section>)}
          </section>
        })}
      </div>}
      <ListPagination page={page} pageSize={pageSize} total={pares.length} previousHref={page > 1 ? href(page - 1) : undefined} nextHref={page * pageSize < pares.length ? href(page + 1) : undefined} />
    </ListPanel>
  </ListPage>
}
