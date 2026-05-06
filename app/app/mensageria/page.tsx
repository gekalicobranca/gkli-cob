import { PageHeader } from '@/components/ui/page-header'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { StatusBadge } from '@/components/data/status-badge'
import { EmptyState } from '@/components/data/empty-state'
import { getPermittedCarteiras } from '@/utils/auth/get-permitted-carteiras'
import { listMensagens } from '@/features/mensageria/queries'
import { listReguaCobrancaPreview } from '@/features/regua/queries'
import { gerarLoteReguaCobranca } from '@/features/regua/actions'

export default async function MensageriaPage() {
  const scope = await getPermittedCarteiras()
  const [rows, preview] = await Promise.all([listMensagens(scope), listReguaCobrancaPreview(scope)])
  const elegiveis = preview.filter((item: any) => item.elegivel)

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="gkli-cob"
        title="Mensageria"
        description="Acompanhe fila, logs e geração de mensagens da régua respeitando a configuração de cada condomínio."
        actions={
          <form action={gerarLoteReguaCobranca}>
            <Button type="submit">Gerar lote da régua</Button>
          </form>
        }
      />

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-400">Elegíveis agora</p>
          <p className="mt-3 text-3xl font-semibold text-slate-950">{elegiveis.length}</p>
          <p className="mt-1 text-sm text-slate-500">Cobranças que já atingiram o D+ do condomínio.</p>
        </Card>
        <Card>
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-400">Em análise</p>
          <p className="mt-3 text-3xl font-semibold text-slate-950">{preview.length}</p>
          <p className="mt-1 text-sm text-slate-500">Cobranças abertas avaliadas pelo motor da régua.</p>
        </Card>
        <Card>
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-400">Fila registrada</p>
          <p className="mt-3 text-3xl font-semibold text-slate-950">{rows.length}</p>
          <p className="mt-1 text-sm text-slate-500">Mensagens já existentes na fila operacional.</p>
        </Card>
      </div>

      <Card>
        <div className="grid gap-3 md:grid-cols-[1fr_180px_180px]">
          <Input placeholder="Buscar..." />
          <select className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm outline-none">
            <option>Status</option>
          </select>
          <select className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm outline-none">
            <option>Carteira</option>
          </select>
        </div>
      </Card>

      <Card className="overflow-hidden p-0">
        <div className="border-b border-slate-100 px-5 py-4">
          <h2 className="text-sm font-semibold text-slate-950">Prévia da régua de cobrança</h2>
          <p className="mt-1 text-xs text-slate-500">Cada cobrança respeita o campo “início da cobrança em D+” configurado no condomínio.</p>
        </div>
        {preview.length === 0 ? (
          <div className="p-5">
            <EmptyState title="Nenhuma cobrança em análise" description="Importe cobranças abertas para alimentar a régua." />
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {preview.slice(0, 12).map((row: any) => (
              <div key={row.id} className="grid gap-3 px-5 py-4 lg:grid-cols-[1fr_140px_150px] lg:items-center">
                <div>
                  <p className="text-sm font-semibold text-slate-950">
                    {row.unidades?.responsavel_nome ?? 'Responsável não informado'} · {row.unidades?.identificacao ?? 'Unidade'}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    {row.condominios?.nome ?? 'Condomínio'} · atraso D+{row.dias_atraso} · entra na régua em D+{row.inicio_cobranca_dias}
                  </p>
                  <p className="mt-2 line-clamp-2 text-xs text-slate-600">{row.mensagem_preview}</p>
                </div>
                <StatusBadge status={row.elegivel ? 'elegível' : 'aguardando'} />
                <div className="text-sm text-slate-500 lg:text-right">{row.etapa?.canal ?? 'whatsapp'} · {row.intensidade}</div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {rows.length === 0 ? (
        <EmptyState title="Nenhuma mensagem na fila" description="Gere um lote para iniciar a fila operacional." />
      ) : (
        <Card className="overflow-hidden p-0">
          <div className="border-b border-slate-100 px-5 py-4">
            <h2 className="text-sm font-semibold text-slate-950">Fila de mensagens</h2>
          </div>
          <div className="divide-y divide-slate-100">
            {rows.map((row: any) => (
              <div key={row.id} className="grid gap-3 px-5 py-4 lg:grid-cols-[1fr_160px_220px] lg:items-center">
                <div>
                  <p className="text-sm font-semibold text-slate-950">
                    {row.destinatario ?? 'Destinatário não informado'}
                  </p>
                  <p className="mt-1 line-clamp-2 text-xs text-slate-500">
                    {row.conteudo ?? row.contexto ?? 'Mensagem operacional'}
                  </p>
                </div>
                <StatusBadge status={String(row.status ?? 'pendente')} />
                <div className="text-sm text-slate-500 lg:text-right">{row.canal ?? 'canal'} · ID {String(row.id).slice(0, 8)}</div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  )
}
