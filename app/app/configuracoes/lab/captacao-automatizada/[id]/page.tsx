import { notFound } from 'next/navigation'
import { ArrowLeft, CheckCircle2, Download, FileSpreadsheet, ListChecks, WalletCards } from 'lucide-react'
import { PageHeader } from '@/components/ui/page-header'
import { Card } from '@/components/ui/card'
import { ButtonLink } from '@/components/ui/button'
import { StatusBadge } from '@/components/ui/status-badge'
import { ListKpiGrid, ListPage, ListPanel, ListPanelHeader, ListTitle } from '@/components/layout/list-page'
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

  return <ListPage>
    <PageHeader eyebrow="Configurações · Lab · Captação automatizada" title={data.nome_arquivo || 'Validar importação'} description={`Condomínio: ${preview.condominio || 'não identificado'}. Confira a conversão antes de liberar a importação.`} actions={<><StatusBadge status={data.status} /><ButtonLink href={`/api/captacao-automatizada/conversoes/${data.id}/exportar`} variant="secondary"><Download size={16} />Exportar XLSX</ButtonLink><ButtonLink href="/app/configuracoes/lab/captacao-automatizada" variant="secondary"><ArrowLeft size={16} />Voltar</ButtonLink></>} />

    <ListKpiGrid className="md:grid-cols-3 xl:grid-cols-3">
      <Resumo icon={<ListChecks size={18} />} label="Cobranças" value={data.total_cobrancas ?? 0} />
      <Resumo icon={<FileSpreadsheet size={18} />} label="Parcelas" value={data.total_parcelas ?? 0} />
      <Resumo icon={<WalletCards size={18} />} label="Valor total" value={Number(data.valor_total ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} />
    </ListKpiGrid>

    <ListPanel>
      <ListPanelHeader><ListTitle title="Prévia da conversão" description={`Primeiras 30 cobranças de ${cobrancas.length}. Use a exportação para conferir a relação completa.`} /></ListPanelHeader>
      <div className="overflow-x-auto"><table className="min-w-[850px] w-full text-left text-sm"><thead className="bg-slate-50 text-xs font-medium uppercase text-slate-400"><tr><th className="px-4 py-3">Bloco</th><th className="px-4 py-3">Unidade</th><th className="px-4 py-3">Responsável</th><th className="px-4 py-3">Recibo</th><th className="px-4 py-3">Vencimento</th><th className="px-4 py-3 text-right">Total</th></tr></thead><tbody className="divide-y divide-slate-100">{cobrancas.slice(0, 30).map((row, index) => <tr key={`${row.recibo}-${index}`} className="hover:bg-slate-50"><td className="px-4 py-3 text-slate-600">{row.bloco || '—'}</td><td className="px-4 py-3 font-medium text-slate-950">{row.unidade}</td><td className="px-4 py-3 text-slate-600">{row.responsavel || '—'}</td><td className="px-4 py-3 text-slate-600">{row.recibo || '—'}</td><td className="px-4 py-3 text-slate-600">{row.vencimento || '—'}</td><td className="px-4 py-3 text-right font-medium">{Number(row.valorTotal ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td></tr>)}</tbody></table></div>
    </ListPanel>

    <Card className="flex flex-col gap-4 p-4 md:flex-row md:items-center md:justify-between"><div>{finalizada ? <p className="flex items-center gap-2 font-medium text-emerald-700"><CheckCircle2 size={18} />Importação já confirmada</p> : <><p className="font-medium text-slate-950">Pronto para importar?</p><p className="mt-1 text-sm text-slate-500">A confirmação aplica conciliação, régua e registra o histórico.</p></>}</div>{!finalizada && <ConfirmarCaptacaoButton conversaoId={data.id} condominioId={preview.condominioId} carteiraId={preview.carteiraId} />}</Card>
  </ListPage>
}

function Resumo({ icon, label, value }: { icon: React.ReactNode; label: string; value: string | number }) { return <Card className="relative overflow-hidden p-3"><div className="absolute right-4 top-3 rounded-lg bg-[var(--gkli-primary-light)] p-2 text-[var(--gkli-primary)]">{icon}</div><p className="text-xs font-medium uppercase text-slate-400">{label}</p><p className="mt-1.5 text-2xl font-semibold text-slate-950">{value}</p></Card> }
