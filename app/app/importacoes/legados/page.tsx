import Link from 'next/link'
import {
  ArrowUpRight,
  FileSpreadsheet,
  Gavel,
  Plus,
  Scale,
  Search,
  Table2,
} from 'lucide-react'
import { PageHeader } from '@/components/ui/page-header'
import { Card } from '@/components/ui/card'
import { ButtonLink } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { StatusBadge } from '@/components/data/status-badge'
import { EmptyState } from '@/components/data/empty-state'
import { formatCurrency } from '@/utils/formatters/currency'
import { formatDateBR } from '@/utils/formatters/date'
import { getPermittedCarteiras } from '@/utils/auth/get-permitted-carteiras'
import { listImportacoes } from '@/features/importacoes/queries'

const legacyCards = [
  {
    tipo: 'acordos_extra',
    title: 'Acordos extrajudiciais legados',
    description:
      'Histórico de acordos amigáveis anteriores, com parcelas, status, documentos e vínculo com unidade existente.',
    icon: Scale,
    templateHref: '/templates/importacao-acordos-extra.xlsx',
  },
  {
    tipo: 'acordos_judiciais',
    title: 'Acordos judiciais legados',
    description:
      'Histórico judicial com número do processo, valores, parcelas e vínculo preservado por condomínio/unidade.',
    icon: Gavel,
    templateHref: '/templates/importacao-acordos-judiciais.xlsx',
  },
]

const legacyTypes = legacyCards.map((card) => card.tipo)

function labelTipo(tipo: string) {
  const found = legacyCards.find((card) => card.tipo === tipo)
  return found?.title ?? tipo
}

export default async function ImportacoesLegadasPage() {
  const scope = await getPermittedCarteiras()

  const rows = (await listImportacoes(scope)).filter((row: any) =>
    legacyTypes.includes(row.tipo)
  )

  const concluidas = rows.filter((row: any) => row.status === 'confirmada').length

  const erro = rows.filter((row: any) => row.status === 'erro').length

  const valorPreview = rows.reduce(
    (sum: number, row: any) =>
      sum + Number(row.resumo?.valor_total_valido ?? 0),
    0
  )

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Importações"
        title="Importações legadas"
        description="Área separada para acordos históricos. Aqui entram somente legados extrajudiciais e judiciais, com geração de acordos e parcelas."
        actions={
          <>
            <ButtonLink href="/app/importacoes" variant="secondary">
              Importações operacionais
            </ButtonLink>

            <ButtonLink href="/app/importacoes/legados/nova">
              <Plus size={16} />
              Novo legado
            </ButtonLink>
          </>
        }
      />

      <section className="grid gap-3 md:grid-cols-3">
        <Card className="relative overflow-hidden p-5">
          <div className="absolute right-4 top-4 rounded-2xl bg-[var(--gkli-primary-light)] p-2 text-[var(--gkli-primary)]">
            <FileSpreadsheet size={18} />
          </div>

          <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">
            Concluídas
          </p>
          <p className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">
            {concluidas}
          </p>
          <p className="mt-1 text-sm text-slate-500">legados aplicados</p>
        </Card>

        <Card className="p-5">
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">
            Com erro
          </p>
          <p className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">
            {erro}
          </p>
          <p className="mt-1 text-sm text-slate-500">precisam saneamento</p>
        </Card>

        <Card className="p-5">
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">
            Valor em previews
          </p>
          <p className="mt-3 text-2xl font-semibold tracking-tight text-slate-950">
            {formatCurrency(valorPreview)}
          </p>
          <p className="mt-1 text-sm text-slate-500">
            acordos históricos válidos
          </p>
        </Card>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        {legacyCards.map((card) => {
          const Icon = card.icon

          return (
            <Card
              key={card.tipo}
              className="group flex h-full flex-col justify-between overflow-hidden p-5 transition hover:-translate-y-0.5 hover:border-[var(--gkli-primary)]/30 hover:shadow-sm"
            >
              <div>
                <div className="flex items-start justify-between gap-4">
                  <div className="rounded-2xl bg-[var(--gkli-primary-light)] p-3 text-[var(--gkli-primary)]">
                    <Icon size={20} />
                  </div>

                  <span className="rounded-full border border-slate-200 px-3 py-1 text-xs text-slate-500">
                    XLSX legado
                  </span>
                </div>

                <h2 className="mt-4 text-lg font-semibold tracking-tight text-slate-950">
                  {card.title}
                </h2>

                <p className="mt-2 min-h-[48px] text-sm leading-6 text-slate-600">
                  {card.description}
                </p>
              </div>

              <div className="mt-5 flex flex-col gap-2 sm:flex-row">
                <ButtonLink
                  href={`/app/importacoes/legados/nova?tipo=${card.tipo}`}
                  className="justify-center"
                >
                  <Plus size={16} />
                  Importar legado
                </ButtonLink>

                <ButtonLink
                  href={card.templateHref}
                  variant="secondary"
                  className="justify-center"
                  download
                >
                  <Table2 size={16} />
                  Baixar template
                </ButtonLink>
              </div>
            </Card>
          )
        })}
      </section>

      <Card className="overflow-hidden p-0">
        <div className="border-b border-slate-100 px-5 py-4">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <h2 className="text-base font-medium text-slate-950">
                Histórico de legados
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                Somente acordos extra e judiciais importados pelo fluxo isolado.
              </p>
            </div>

            <div className="relative md:w-[360px]">
              <Search
                size={16}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
              />
              <Input className="pl-9" placeholder="Buscar arquivo..." />
            </div>
          </div>
        </div>

        {rows.length === 0 ? (
          <div className="p-5">
            <EmptyState
              title="Nenhuma importação legada encontrada"
              description="Importe acordos históricos somente depois de cadastrar condomínios e unidades."
            />
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {rows.map((row: any) => (
              <Link
                key={row.id}
                href={`/app/importacoes/legados/${row.id}`}
                className="group grid gap-4 px-5 py-4 transition hover:bg-slate-50 xl:grid-cols-[minmax(320px,1.4fr)_130px_160px_160px_80px] xl:items-center"
              >
                <div>
                  <p className="text-sm font-medium text-slate-950">
                    {row.arquivo_nome ?? 'Arquivo sem nome'}
                  </p>

                  <p className="mt-1 text-xs text-slate-500">
                    {labelTipo(row.tipo)} ·{' '}
                    {formatCurrency(Number(row.resumo?.valor_total_valido ?? 0))}
                  </p>
                </div>

                <StatusBadge status={row.status} />

                <div>
                  <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">
                    Validação
                  </p>
                  <p className="mt-1 text-sm text-slate-700">
                    {row.total_validas}/{row.total_linhas}
                  </p>
                </div>

                <div>
                  <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">
                    Criada em
                  </p>
                  <p className="mt-1 text-sm text-slate-700">
                    {formatDateBR(row.created_at)}
                  </p>
                </div>

                <div className="flex justify-end">
                  <ArrowUpRight
                    size={16}
                    className="text-slate-400 group-hover:text-[var(--gkli-primary)]"
                  />
                </div>
              </Link>
            ))}
          </div>
        )}
      </Card>
    </div>
  )
}