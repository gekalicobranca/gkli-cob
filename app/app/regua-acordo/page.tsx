import Link from 'next/link'
import { ArrowRight, CheckCircle2, Clock3, Handshake, MessageSquareWarning, PlayCircle } from 'lucide-react'

import { Card } from '@/components/ui/card'
import { PageHeader } from '@/components/ui/page-header'
import { getPermittedCarteiras } from '@/utils/auth/get-permitted-carteiras'
import { formatCurrency } from '@/utils/formatters/currency'
import { formatDateBR } from '@/utils/formatters/date'
import { listReguaAcordoPreview } from '@/features/regua/queries'
import { gerarLoteReguaAcordos } from '@/features/regua/actions'

function metric(value: unknown) {
  return Number(value ?? 0).toLocaleString('pt-BR')
}

function diasLabel(dias: number) {
  if (dias < 0) return `D${dias}`
  if (dias === 0) return 'vence hoje'
  return `${dias} dia(s) em atraso`
}

function badgeClasses(elegivel: boolean, dias: number) {
  if (!elegivel) return 'border-slate-200 bg-slate-50 text-slate-500'
  if (dias >= 2) return 'border-red-200 bg-red-50 text-red-700'
  if (dias >= 0) return 'border-amber-200 bg-amber-50 text-amber-700'
  return 'border-sky-200 bg-sky-50 text-sky-700'
}

export default async function ReguaAcordoPage() {
  const scope = await getPermittedCarteiras()
  const preview = await listReguaAcordoPreview(scope)

  const elegiveis = preview.filter((item: any) => item.elegivel)
  const preventivos = elegiveis.filter((item: any) => Number(item.dias_relativos_vencimento ?? 0) < 0)
  const vencidos = elegiveis.filter((item: any) => Number(item.dias_relativos_vencimento ?? 0) >= 0)
  const semDestino = elegiveis.filter((item: any) => !item.destinatario_preview)
  const valorEmAberto = preview.reduce((total: number, item: any) => {
    return total + Number(item.parcela?.valor ?? 0)
  }, 0)

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Mensageria e Régua"
        title="Régua de acordos"
        description="Previna rompimentos, lembre parcelas próximas do vencimento e gere lotes de cobrança de acordo para aprovação operacional."
        actions={
          <form action={gerarLoteReguaAcordos}>
            <button
              type="submit"
              className="inline-flex min-h-10 items-center justify-center gap-2 rounded-2xl border border-white/25 bg-white/10 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-white/20"
            >
              <PlayCircle size={16} />
              Gerar lote de acordos
            </button>
          </form>
        }
      />

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Card className="p-4">
          <p className="text-xs uppercase tracking-[0.16em] text-slate-400">Acordos avaliados</p>
          <p className="mt-3 text-3xl text-slate-950">{metric(preview.length)}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs uppercase tracking-[0.16em] text-slate-400">Elegíveis</p>
          <p className="mt-3 text-3xl text-emerald-700">{metric(elegiveis.length)}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs uppercase tracking-[0.16em] text-slate-400">Preventivos</p>
          <p className="mt-3 text-3xl text-sky-700">{metric(preventivos.length)}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs uppercase tracking-[0.16em] text-slate-400">Vencidos</p>
          <p className="mt-3 text-3xl text-red-700">{metric(vencidos.length)}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs uppercase tracking-[0.16em] text-slate-400">Valor aberto</p>
          <p className="mt-3 text-2xl text-slate-950">{formatCurrency(valorEmAberto)}</p>
        </Card>
      </section>

      {semDestino.length ? (
        <Card className="border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          <div className="flex gap-3">
            <MessageSquareWarning className="mt-0.5 h-5 w-5 shrink-0" />
            <div>
              <p className="font-semibold">Atenção: {semDestino.length} acordo(s) elegíveis sem telefone/e-mail.</p>
              <p className="mt-1 text-amber-700">Esses itens serão pulados até que o cadastro da unidade tenha um destinatário válido para o canal da etapa.</p>
            </div>
          </div>
        </Card>
      ) : null}

      <Card className="overflow-hidden p-0">
        <div className="border-b border-slate-100 px-5 py-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-base font-semibold text-slate-950">Prévia operacional</h2>
              <p className="mt-1 text-sm text-slate-500">A geração cria mensagens pendentes de aprovação em lotes do tipo régua de acordo.</p>
            </div>
            <Link href="/app/lotes" className="inline-flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-slate-950">
              Ver lotes <ArrowRight size={14} />
            </Link>
          </div>
        </div>

        {preview.length === 0 ? (
          <div className="p-6 text-sm text-slate-500">Nenhum acordo ativo com parcelas abertas encontrado para a régua.</div>
        ) : (
          <div className="divide-y divide-slate-100">
            {preview.slice(0, 80).map((item: any) => {
              const unidade = item.unidades
              const condominio = item.condominios
              const parcela = item.parcela
              const dias = Number(item.dias_relativos_vencimento ?? 0)
              return (
                <article key={`${item.id}-${parcela?.id ?? 'sem-parcela'}`} className="grid gap-4 px-5 py-4 lg:grid-cols-[1fr_220px_180px] lg:items-start">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`rounded-full border px-3 py-1 text-xs ${badgeClasses(Boolean(item.elegivel), dias)}`}>
                        {item.elegivel ? diasLabel(dias) : item.motivo ?? 'fora da janela'}
                      </span>
                      <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-500">
                        {item.etapa?.canal ?? 'whatsapp'} · {item.etapa?.tom ?? 'medio'}
                      </span>
                    </div>
                    <h3 className="mt-3 text-sm font-semibold text-slate-950">
                      {unidade?.responsavel_nome ?? 'Responsável não informado'} · unidade {unidade?.identificacao ?? '—'}
                    </h3>
                    <p className="mt-1 text-sm text-slate-500">{condominio?.nome ?? 'Condomínio não informado'}</p>
                    <p className="mt-3 whitespace-pre-wrap rounded-2xl bg-slate-50 p-3 text-sm leading-6 text-slate-600">
                      {item.mensagem_preview ?? 'Sem mensagem de prévia.'}
                    </p>
                  </div>

                  <div className="rounded-2xl border border-slate-100 bg-slate-50 p-3 text-sm text-slate-600">
                    <div className="flex items-center gap-2 text-slate-500">
                      <Handshake size={15} />
                      Acordo
                    </div>
                    <p className="mt-2 text-slate-950">{formatCurrency(Number(item.valor_acordado ?? 0))}</p>
                    <p className="mt-1 text-xs text-slate-500">Status: {item.status_financeiro ?? item.status}</p>
                  </div>

                  <div className="rounded-2xl border border-slate-100 bg-white p-3 text-sm text-slate-600">
                    <div className="flex items-center gap-2 text-slate-500">
                      <Clock3 size={15} />
                      Parcela
                    </div>
                    <p className="mt-2 text-slate-950">{parcela ? formatCurrency(Number(parcela.valor ?? 0)) : '—'}</p>
                    <p className="mt-1 text-xs text-slate-500">Venc.: {formatDateBR(parcela?.vencimento)}</p>
                    <p className="mt-1 text-xs text-slate-500">Destino: {item.destinatario_preview || 'sem destino'}</p>
                  </div>
                </article>
              )
            })}
          </div>
        )}
      </Card>

      <Card className="p-5">
        <div className="flex gap-3 text-sm text-slate-600">
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
          <div>
            <p className="font-semibold text-slate-950">Como funciona</p>
            <p className="mt-1 leading-6">
              A régua de acordos gera mensagens para parcelas próximas do vencimento ou vencidas, separadas da régua de cobrança. O lote gerado segue para aprovação operacional antes de qualquer envio assistido por WhatsApp ou e-mail.
            </p>
          </div>
        </div>
      </Card>
    </div>
  )
}
