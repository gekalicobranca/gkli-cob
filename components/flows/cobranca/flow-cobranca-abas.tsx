'use client'

import { useState, useTransition, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { Download } from 'lucide-react'
import { Button, ButtonLink } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { FlowCobrancaPainelWorkbench } from './cobrancas-painel-workbench'
import { FlowCobrancaHistorico, FlowCobrancaWorkbench } from './flow-cobranca-workbench'
import { formatCurrency } from '@/utils/formatters/currency'
import { formatDateBR } from '@/utils/formatters/date'
import type { CanalFlowCobranca, FlowCobrancaAba } from '@/features/flows/cobranca/rotas'

export function FlowCobrancaAbas({ canal, aba, maestro, painel, disponibilidade, saneamento, saneamentoTotal, reguas, flows, initialStep, initialSelectedIds, returnQuery }: {
  canal: CanalFlowCobranca
  aba: FlowCobrancaAba
  saneamentoTotal: number
  maestro: ReactNode; painel: any[]; disponibilidade: any[]; saneamento: any[]; reguas: any[]; flows: any[]
  initialStep?: 'lotes' | 'flows'; initialSelectedIds: string[]; returnQuery: string
}) {
  const router = useRouter()
  const [atualizando, startRefresh] = useTransition()
  const [atualizacaoSolicitada, setAtualizacaoSolicitada] = useState(false)
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
  return <div className="space-y-4">
    {aba === 'flows' || aba === 'historico' ? <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h2 className="text-base font-semibold text-slate-950">{aba === 'flows' ? 'Acompanhar envios' : 'Consultar histórico'}</h2></div>
      <Button type="button" variant="secondary" loading={atualizando} loadingLabel="Atualizando..." onClick={() => startRefresh(() => router.refresh())}>Atualizar</Button>
    </div> : null}
    {aba === 'maestro' ? maestro : null}
    {aba === 'gerar' ? <div className="space-y-4">
      <FlowCobrancaPainelWorkbench rows={painel} returnQuery={returnQuery} />
      <FlowCobrancaWorkbench key={`gerar-${returnQuery}`} canal={canal} mode="gerar" returnQuery={returnQuery} disponibilidade={disponibilidade} reguas={reguas} flows={[]} initialStep={initialStep} initialSelectedIds={initialSelectedIds} />
    </div> : null}
    {aba === 'flows' ? <FlowCobrancaWorkbench key={`flows-${returnQuery}`} canal={canal} mode="flows" returnQuery={returnQuery} disponibilidade={[]} reguas={[]} flows={flows} initialStep="flows" /> : null}
    {aba === 'historico' ? <FlowCobrancaHistorico flows={flows} porAgenda={new URLSearchParams(returnQuery).get('ordenar')?.startsWith('agenda_')} /> : null}
    {aba === 'saneamento' ? <Card className="overflow-hidden p-0">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-4">
        <div><h2 className="font-semibold">Cobranças para saneamento</h2><p className="mt-1 text-sm text-slate-500">Corrija o responsável ou {canal === 'email' ? 'o e-mail' : 'o telefone'} da unidade.{canal === 'email' ? ' Para pendências do Maestro, use Reavaliar pendências na montagem após a correção.' : ''}</p><p className="mt-1 text-xs text-slate-500">O Excel respeita os filtros e inclui contatos por unidade, campos para correção, cobranças e resumo por condomínio.</p></div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="secondary" loading={atualizando} loadingLabel="Atualizando…" onClick={() => {
            setAtualizacaoSolicitada(true)
            startRefresh(() => router.refresh())
          }}>Atualizar lista</Button>
          <Button type="button" variant="secondary" loading={exportando} loadingLabel="Gerando Excel…" onClick={exportarSaneamento}><Download size={16} aria-hidden="true" />Exportar todos os resultados</Button>
        </div>
      </div>
      {erroExportacao ? <p role="alert" className="px-4 py-3 text-sm text-rose-700">{erroExportacao}</p> : null}
      {atualizacaoSolicitada && !atualizando ? <p role="status" className="px-4 py-3 text-sm text-slate-600">Lista atualizada. {saneamentoTotal} cobrança(s) precisam de correção nesta página.</p> : null}
      {!saneamento.length ? <p className="p-5 text-sm text-slate-500">Nenhuma cobrança para saneamento nesta página.</p> : <div className="divide-y divide-slate-100">{saneamento.map(row => <div key={row.id} className="grid items-center gap-3 p-4 lg:grid-cols-[minmax(260px,1fr)_140px_150px_auto]">
        <div><p className="text-sm font-semibold">{row.condominio?.nome_operacional || row.condominio?.nome || 'Condomínio não informado'}</p><p className="text-sm text-amber-700">{row.motivo_saneamento || 'Responsável da unidade não cadastrado'}</p><p className="text-sm text-slate-600">{row.unidade?.bloco ? `Bloco ${row.unidade.bloco} · ` : ''}Unidade {row.unidade?.identificacao || 'não vinculada'}</p></div>
        <div className="text-sm">{formatDateBR(row.vencimento)}</div>
        <div className="text-sm font-medium">{formatCurrency(Number(row.valor_atualizado ?? row.valor_original ?? 0))}</div>
        <ButtonLink href={row.unidade_id ? `/app/unidades/${row.unidade_id}` : `/app/cobrancas/${row.id}`} variant="secondary">{row.unidade_id ? 'Corrigir unidade' : 'Abrir cobrança'}</ButtonLink>
      </div>)}</div>}
    </Card> : null}
  </div>
}
