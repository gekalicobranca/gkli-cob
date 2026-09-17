'use client'

import { useState, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { Download } from 'lucide-react'
import { Button, ButtonLink } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { FlowCobrancaPainelWorkbench } from './cobrancas-painel-workbench'
import { FlowCobrancaHistorico, FlowCobrancaWorkbench } from './flow-cobranca-workbench'
import { formatCurrency } from '@/utils/formatters/currency'
import { formatDateBR } from '@/utils/formatters/date'

export function FlowCobrancaAbas({ maestro, painel, disponibilidade, saneamento, reguas, flows, initialStep, initialSelectedIds, returnQuery }: {
  maestro: ReactNode; painel: any[]; disponibilidade: any[]; saneamento: any[]; reguas: any[]; flows: any[]
  initialStep?: 'lotes' | 'flows'; initialSelectedIds: string[]; returnQuery: string
}) {
  const [aba, setAba] = useState('operacao')
  const router = useRouter()
  const [exportando, setExportando] = useState(false)
  const [erroExportacao, setErroExportacao] = useState('')
  async function exportarSaneamento() {
    setExportando(true)
    setErroExportacao('')
    try {
      const response = await fetch(`/api/flows/cobranca/saneamento/exportar?${returnQuery}`)
      if (!response.ok || !response.headers.get('content-type')?.includes('spreadsheetml')) {
        throw new Error('Não foi possível exportar a lista. Atualize a página e tente novamente.')
      }
      const url = URL.createObjectURL(await response.blob())
      const link = document.createElement('a')
      link.href = url
      link.download = `gkli-saneamento-${new Date().toISOString().slice(0, 10)}.xlsx`
      document.body.appendChild(link)
      link.click()
      link.remove()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch (error) {
      setErroExportacao(error instanceof Error ? error.message : 'Erro ao exportar a lista.')
    } finally {
      setExportando(false)
    }
  }
  const flowsHistorico = flows.filter(flow => ['concluido', 'concluido_com_falhas'].includes(flow.status))
  const flowsOperacao = flows.filter(flow => !['concluido', 'concluido_com_falhas'].includes(flow.status))
  return <div className="space-y-4">
    <nav aria-label="Abas do Flow de cobrança" className="flex flex-wrap gap-2">
      <Button type="button" variant={aba === 'operacao' ? 'primary' : 'secondary'} aria-pressed={aba === 'operacao'} onClick={() => setAba('operacao')}>Operação</Button>
      <Button type="button" variant={aba === 'saneamento' ? 'primary' : 'secondary'} aria-pressed={aba === 'saneamento'} onClick={() => setAba('saneamento')}>Saneamento ({saneamento.length})</Button>
      <Button type="button" variant={aba === 'historico' ? 'primary' : 'secondary'} aria-pressed={aba === 'historico'} onClick={() => setAba('historico')}>Histórico ({flowsHistorico.length})</Button>
      <Button type="button" variant={aba === 'maestro' ? 'primary' : 'secondary'} aria-pressed={aba === 'maestro'} onClick={() => setAba('maestro')}>Maestro</Button>
    </nav>
    {aba === 'maestro' ? maestro : null}
    <div hidden={aba !== 'operacao'} className="space-y-4">
      <FlowCobrancaPainelWorkbench rows={painel} returnQuery={returnQuery} />
      <FlowCobrancaWorkbench disponibilidade={disponibilidade} reguas={reguas} flows={flowsOperacao} initialStep={initialStep} initialSelectedIds={initialSelectedIds} />
    </div>
    {aba === 'historico' ? <FlowCobrancaHistorico flows={flowsHistorico} /> : null}
    {aba === 'saneamento' ? <Card className="overflow-hidden p-0">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-4">
        <div><h2 className="font-semibold">Cobranças para saneamento</h2><p className="mt-1 text-sm text-slate-500">Corrija o responsável ou o e-mail da unidade. Para pendências do Maestro, use Reavaliar pendências na montagem após a correção.</p></div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="secondary" onClick={() => router.refresh()}>Atualizar lista</Button>
          <Button type="button" variant="secondary" disabled={!saneamento.length} loading={exportando} loadingLabel="Gerando Excel…" onClick={exportarSaneamento}><Download size={16} aria-hidden="true" />Exportar Excel</Button>
        </div>
      </div>
      {erroExportacao ? <p role="alert" className="px-4 py-3 text-sm text-rose-700">{erroExportacao}</p> : null}
      {!saneamento.length ? <p className="p-5 text-sm text-slate-500">Nenhuma cobrança para saneamento neste filtro.</p> : <div className="divide-y divide-slate-100">{saneamento.map(row => <div key={row.id} className="grid items-center gap-3 p-4 lg:grid-cols-[minmax(260px,1fr)_140px_150px_auto]">
        <div><p className="text-sm font-semibold">{row.condominio?.nome_operacional || row.condominio?.nome || 'Condomínio não informado'}</p><p className="text-sm text-amber-700">{row.motivo_saneamento || 'Responsável da unidade não cadastrado'}</p><p className="text-sm text-slate-600">{row.unidade?.bloco ? `Bloco ${row.unidade.bloco} · ` : ''}Unidade {row.unidade?.identificacao || 'não vinculada'}</p></div>
        <div className="text-sm">{formatDateBR(row.vencimento)}</div>
        <div className="text-sm font-medium">{formatCurrency(Number(row.valor_atualizado ?? row.valor_original ?? 0))}</div>
        <ButtonLink href={row.unidade_id ? `/app/unidades/${row.unidade_id}` : `/app/cobrancas/${row.id}`} variant="secondary">{row.unidade_id ? 'Corrigir unidade' : 'Abrir cobrança'}</ButtonLink>
      </div>)}</div>}
    </Card> : null}
  </div>
}
