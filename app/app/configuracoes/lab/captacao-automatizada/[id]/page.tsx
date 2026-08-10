import { notFound } from 'next/navigation'
import { ArrowLeft, CheckCircle2 } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { ButtonLink } from '@/components/ui/button'
import { StatusBadge } from '@/components/ui/status-badge'
import { createAdminClient } from '@/utils/supabase/admin'
import { ConfirmarCaptacaoButton } from './confirmar-captacao-button'

export const dynamic = 'force-dynamic'

export default async function ValidarCaptacaoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = createAdminClient()
  const { data } = await supabase.from('conversoes_relatorio').select('id, nome_arquivo, status, preview_json, total_cobrancas, total_parcelas, valor_total, inconsistencias_json').eq('id', id).eq('origem', 'captacao_automatizada:bbz').maybeSingle()
  if (!data) notFound()
  const preview: any = data.preview_json ?? {}
  const cobrancas: any[] = Array.isArray(preview.cobrancas) ? preview.cobrancas : []
  const finalizada = ['concluido', 'concluido_com_alertas'].includes(String(data.status))

  return <div className="space-y-5">
    <div className="flex items-center justify-between gap-4"><ButtonLink href="/app/configuracoes/lab/captacao-automatizada" variant="secondary"><ArrowLeft size={16} />Voltar</ButtonLink><StatusBadge status={data.status} /></div>
    <Card className="p-6"><p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#04799a]">Validação humana obrigatória</p><h1 className="mt-3 text-2xl font-semibold text-slate-950">{data.nome_arquivo}</h1><p className="mt-2 text-sm text-slate-500">Condomínio: {preview.condominio}. Confira a prévia abaixo antes de liberar a importação.</p>
      <div className="mt-5 grid gap-3 md:grid-cols-3"><Resumo label="Cobranças" value={data.total_cobrancas ?? 0} /><Resumo label="Parcelas" value={data.total_parcelas ?? 0} /><Resumo label="Valor total" value={Number(data.valor_total ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} /></div>
    </Card>
    <Card className="overflow-hidden p-0"><div className="border-b border-slate-100 px-5 py-4"><h2 className="font-semibold text-slate-950">Amostra da conversão</h2><p className="mt-1 text-xs text-slate-500">Primeiras 30 cobranças de {cobrancas.length}</p></div><div className="overflow-x-auto"><table className="min-w-[850px] w-full text-left text-sm"><thead className="bg-slate-50 text-xs text-slate-500"><tr><th className="px-4 py-3">Bloco</th><th className="px-4 py-3">Unidade</th><th className="px-4 py-3">Responsável</th><th className="px-4 py-3">Recibo</th><th className="px-4 py-3">Vencimento</th><th className="px-4 py-3 text-right">Total</th></tr></thead><tbody className="divide-y divide-slate-100">{cobrancas.slice(0, 30).map((row, index) => <tr key={`${row.recibo}-${index}`}><td className="px-4 py-3 text-slate-600">{row.bloco || '—'}</td><td className="px-4 py-3 font-medium text-slate-950">{row.unidade}</td><td className="px-4 py-3 text-slate-600">{row.responsavel || '—'}</td><td className="px-4 py-3 text-slate-600">{row.recibo || '—'}</td><td className="px-4 py-3 text-slate-600">{row.vencimento || '—'}</td><td className="px-4 py-3 text-right font-medium">{Number(row.valorTotal ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td></tr>)}</tbody></table></div></Card>
    <Card className="flex flex-col gap-4 p-5 md:flex-row md:items-center md:justify-between"><div>{finalizada ? <p className="flex items-center gap-2 font-medium text-emerald-700"><CheckCircle2 size={18} />Importação já confirmada</p> : <><p className="font-medium text-slate-950">Pronto para importar?</p><p className="mt-1 text-sm text-slate-500">A confirmação aplica conciliação, régua e registra o histórico.</p></>}</div>{!finalizada && <ConfirmarCaptacaoButton conversaoId={data.id} condominioId={preview.condominioId} carteiraId={preview.carteiraId} />}</Card>
  </div>
}

function Resumo({ label, value }: { label: string; value: string | number }) { return <div className="rounded-2xl bg-slate-50 p-4"><p className="text-xs text-slate-500">{label}</p><p className="mt-2 text-lg font-semibold text-slate-950">{value}</p></div> }
