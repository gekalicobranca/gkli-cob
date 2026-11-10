import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, CheckCircle2, ChevronLeft, ChevronRight, Download, FileSpreadsheet, ListChecks, WalletCards } from 'lucide-react'
import { PageHeader } from '@/components/ui/page-header'
import { Card } from '@/components/ui/card'
import { ButtonLink } from '@/components/ui/button'
import { StatusBadge } from '@/components/ui/status-badge'
import { ListKpiGrid, ListPage, ListPanel, ListPanelHeader, ListTitle } from '@/components/layout/list-page'
import { createAdminClient } from '@/utils/supabase/admin'
import { ConfirmarCaptacaoButton } from './confirmar-captacao-button'

export const dynamic = 'force-dynamic'

const PAGE_SIZE = 30

export default async function ValidarCaptacaoPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ pagina?: string | string[] }> }) {
  const [{ id }, query] = await Promise.all([params, searchParams])
  const supabase = createAdminClient()
  const { data } = await supabase.from('conversoes_relatorio').select('id, nome_arquivo, status, preview_json, total_cobrancas, total_parcelas, valor_total, inconsistencias_json').eq('id', id).like('origem', 'captacao_automatizada:%').maybeSingle()
  if (!data) notFound()
  const preview: any = data.preview_json ?? {}
  const cobrancas: any[] = Array.isArray(preview.cobrancas) ? preview.cobrancas : []
  const finalizada = ['concluido', 'concluido_com_alertas'].includes(String(data.status))
  const rankingMensal = preview.rankingMensal
  const rawPage = Array.isArray(query.pagina) ? query.pagina[0] : query.pagina
  const totalPages = Math.max(1, Math.ceil(cobrancas.length / PAGE_SIZE))
  const parsedPage = Number.parseInt(rawPage || '1', 10)
  const page = Number.isFinite(parsedPage) ? Math.min(totalPages, Math.max(1, parsedPage)) : 1
  const pageRows = cobrancas.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  // A conversão tem uma prévia da origem; o Maestro guarda a decisão real de montagem por cobrança.
  // Cruzamos pelo recibo registrado na observação da cobrança e deixamos sem classificação quando não há vínculo seguro.
  const [{ data: registros }, { data: montagem }] = await Promise.all([
    supabase.from('cobrancas').select('id, observacoes, status_operacional, status_financeiro, automacao_bloqueada').eq('conversao_relatorio_id', id),
    supabase.from('maestro_flow_montagens').select('status, flow_ids, plano, pendencias').eq('conversao_id', id).maybeSingle(),
  ])
  const porRecibo = new Map<string, any>()
  for (const registro of registros ?? []) {
    const recibo = String(registro.observacoes ?? '').match(/Conversão de relatório - recibo ([^\r\n]+)/i)?.[1]?.trim()
    if (recibo) porRecibo.set(recibo, registro)
  }
  const pendenciaPorId = new Map<string, string>()
  for (const pendencia of Array.isArray(montagem?.pendencias) ? montagem.pendencias : []) {
    if (pendencia?.cobranca_id) pendenciaPorId.set(String(pendencia.cobranca_id), String(pendencia.motivo || 'Não incluída na montagem'))
  }
  const idsMontados = new Set<string>((Array.isArray(montagem?.plano) ? montagem.plano.flat(Infinity) : []).map(String))
  const flowIds = Array.isArray(montagem?.flow_ids) ? montagem.flow_ids : []
  const paginationHref = (nextPage: number) => `/app/configuracoes/lab/captacao-automatizada/${data.id}?pagina=${nextPage}`

  return <ListPage>
    <PageHeader eyebrow="Maestro · Validação" title={data.nome_arquivo || 'Validar importação'} description={`Condomínio: ${preview.condominio || 'não identificado'}. Confira a conversão antes de liberar a importação.`} actions={<><StatusBadge status={data.status} /><ButtonLink href={`/api/captacao-automatizada/conversoes/${data.id}/exportar`} variant="secondary"><Download size={16} />Exportar XLSX</ButtonLink>{rankingMensal?.xlsxBase64 ? <ButtonLink href={`/api/captacao-automatizada/conversoes/${data.id}/ranking`} variant="secondary"><Download size={16} />Ranking mensal</ButtonLink> : null}<ButtonLink href="/app/agente-automatico/maestro?aba=agenda" variant="secondary"><ArrowLeft size={16} />Voltar à agenda</ButtonLink></>} />

    <ListKpiGrid className="md:grid-cols-3 xl:grid-cols-3">
      <Resumo icon={<ListChecks size={18} />} label="Cobranças" value={data.total_cobrancas ?? 0} />
      <Resumo icon={<FileSpreadsheet size={18} />} label="Parcelas" value={data.total_parcelas ?? 0} />
      <Resumo icon={<WalletCards size={18} />} label="Valor total" value={Number(data.valor_total ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} />
    </ListKpiGrid>

    <ListPanel>
      <ListPanelHeader><ListTitle title="Validação das cobranças" description={`Exibindo ${cobrancas.length ? (page - 1) * PAGE_SIZE + 1 : 0}–${Math.min(page * PAGE_SIZE, cobrancas.length)} de ${cobrancas.length}. A situação do flow reflete a montagem registrada pelo Maestro; quando não há vínculo seguro, isso fica explícito.`} /></ListPanelHeader>
      <div className="overflow-x-auto"><table className="min-w-[1120px] w-full text-left text-sm"><thead className="bg-slate-50 text-xs font-medium uppercase text-slate-400"><tr><th className="px-4 py-3">Bloco</th><th className="px-4 py-3">Unidade</th><th className="px-4 py-3">Responsável</th><th className="px-4 py-3">Recibo</th><th className="px-4 py-3">Vencimento</th><th className="px-4 py-3 text-right">Total</th><th className="px-4 py-3">Situação da cobrança</th><th className="px-4 py-3">Validação do flow</th></tr></thead><tbody className="divide-y divide-slate-100">{pageRows.map((row, index) => {
        const registro = row.recibo ? porRecibo.get(String(row.recibo).trim()) : null
        const motivo = registro ? pendenciaPorId.get(String(registro.id)) : null
        const montada = registro ? idsMontados.has(String(registro.id)) : false
        let validacao = 'Sem vínculo seguro com o cadastro'
        if (registro && motivo) validacao = motivo
        else if (registro && montada) validacao = flowIds.length ? 'Montada em flow' : 'Incluída no plano do Maestro'
        else if (registro && montagem) validacao = 'Sem decisão registrada pelo Maestro'
        const situacao = registro ? `${registro.status_operacional || 'status operacional não informado'} · ${registro.status_financeiro || 'status financeiro não informado'}${registro.automacao_bloqueada ? ' · automação bloqueada' : ''}` : 'Não localizada pelo recibo'
        return <tr key={`${row.recibo}-${index}`} className="hover:bg-slate-50"><td className="px-4 py-3 text-slate-600">{row.bloco || '—'}</td><td className="px-4 py-3 font-medium text-slate-950">{row.unidade}</td><td className="px-4 py-3 text-slate-600">{row.responsavel || '—'}</td><td className="px-4 py-3 text-slate-600">{row.recibo || '—'}</td><td className="px-4 py-3 text-slate-600">{row.vencimento || '—'}</td><td className="px-4 py-3 text-right font-medium">{Number(row.valorTotal ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td><td className="px-4 py-3 text-slate-600">{situacao}</td><td className="px-4 py-3 font-medium text-slate-700">{validacao}</td></tr>
      })}</tbody></table></div>
      {totalPages > 1 ? <nav aria-label="Paginação das cobranças" className="flex items-center justify-between border-t border-slate-100 px-4 py-3"><span className="text-sm text-slate-500">Página {page} de {totalPages}</span><div className="flex gap-2">{page > 1 ? <Link href={paginationHref(page - 1)} className="inline-flex items-center gap-1 rounded-md border px-3 py-2 text-sm"><ChevronLeft size={16} />Anterior</Link> : null}{page < totalPages ? <Link href={paginationHref(page + 1)} className="inline-flex items-center gap-1 rounded-md border px-3 py-2 text-sm">Próxima<ChevronRight size={16} /></Link> : null}</div></nav> : null}
    </ListPanel>

    <p className="text-sm text-slate-500">“Importação concluída” indica que a captação foi processada; não significa que todas as cobranças sejam válidas para flow. A coluna de validação mostra a decisão registrada pelo Maestro e os motivos de exclusão. Itens sem vínculo seguro ficam sem classificação automática.</p>

    <Card className="flex flex-col gap-4 p-4 md:flex-row md:items-center md:justify-between"><div>{finalizada ? <p className="flex items-center gap-2 font-medium text-emerald-700"><CheckCircle2 size={18} />Importação já confirmada</p> : <><p className="font-medium text-slate-950">Pronto para importar?</p><p className="mt-1 text-sm text-slate-500">A confirmação aplica conciliação, régua e registra o histórico.</p></>}</div>{!finalizada && <ConfirmarCaptacaoButton conversaoId={data.id} condominioId={preview.condominioId} carteiraId={preview.carteiraId} />}</Card>
  </ListPage>
}

function Resumo({ icon, label, value }: { icon: React.ReactNode; label: string; value: string | number }) { return <Card className="relative overflow-hidden p-3"><div className="absolute right-4 top-3 rounded-lg bg-[var(--gkli-primary-light)] p-2 text-[var(--gkli-primary)]">{icon}</div><p className="text-xs font-medium uppercase text-slate-400">{label}</p><p className="mt-1.5 text-2xl font-semibold text-slate-950">{value}</p></Card> }
