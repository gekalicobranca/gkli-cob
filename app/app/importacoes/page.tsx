import Link from 'next/link'
import { ArrowUpRight, FileSpreadsheet, Plus, Search } from 'lucide-react'
import { PageHeader } from '@/components/ui/page-header'
import { Card } from '@/components/ui/card'
import { Button, ButtonLink } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { StatusBadge } from '@/components/data/status-badge'
import { EmptyState } from '@/components/data/empty-state'
import { formatCurrency } from '@/utils/formatters/currency'
import { formatDateBR } from '@/utils/formatters/date'
import { getPermittedCarteiras } from '@/utils/auth/get-permitted-carteiras'
import { listImportacoes } from '@/features/importacoes/queries'

export default async function ImportacoesPage() {
  const scope = await getPermittedCarteiras()
  const rows = await listImportacoes(scope)

  const concluidas = rows.filter((row: any) => row.status === 'concluida').length
  const erro = rows.filter((row: any) => row.status === 'com erro').length
  const valorPreview = rows.reduce((sum: number, row: any) => sum + Number(row.resumo?.valor_total_valido ?? 0), 0)

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Base Cadastral"
        title="Importações"
        description="Upload, preview inteligente, validação por CNPJ e impacto operacional antes de confirmar."
        actions={
          <ButtonLink href="/app/importacoes/nova">
            <Plus size={16} />
            Nova importação
          </ButtonLink>
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
          <p className="mt-1 text-sm text-slate-500">importações aplicadas</p>
        </Card>

        <Card className="p-5">
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">
            Com erro
          </p>
          <p className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">
            {erro}
          </p>
          <p className="mt-1 text-sm text-slate-500">precisam correção</p>
        </Card>

        <Card className="p-5">
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">
            Valor em previews
          </p>
          <p className="mt-3 text-2xl font-semibold tracking-tight text-slate-950">
            {formatCurrency(valorPreview)}
          </p>
          <p className="mt-1 text-sm text-slate-500">impacto financeiro estimado</p>
        </Card>
      </section>

      <Card className="overflow-hidden p-0">
        <div className="border-b border-slate-100 px-5 py-4">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <h2 className="text-base font-medium text-slate-950">
                Histórico de importações
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                Clique para revisar preview, erros e impacto operacional.
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
              title="Nenhuma importação encontrada"
              description="Faça upload de arquivos para iniciar o fluxo de preview."
            />
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {rows.map((row: any) => (
              <Link
                key={row.id}
                href={`/app/importacoes/${row.id}`}
                className="group grid gap-4 px-5 py-4 transition hover:bg-slate-50 xl:grid-cols-[minmax(320px,1.4fr)_130px_160px_160px_80px] xl:items-center"
              >
                <div>
                  <p className="text-sm font-medium text-slate-950">
                    {row.arquivo_nome ?? 'Arquivo sem nome'}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    {row.tipo} · {formatCurrency(Number(row.resumo?.valor_total_valido ?? 0))}
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
