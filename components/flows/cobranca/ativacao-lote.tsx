'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { ImportProgressIndicator } from '@/components/feedback/import-progress-indicator'
import { enviarFlowCobranca } from '@/features/flows/cobranca/actions'
import { ERRO_ATIVACAO_INCERTA, type ResultadoAtivacaoFlow } from '@/features/flows/cobranca/ativacao-resultado'
import { Play } from 'lucide-react'

export function AtivarFlowButton({ flowId, pausado = false }: { flowId: string; pausado?: boolean }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [resultado, setResultado] = useState<ResultadoAtivacaoFlow | null>(null)
  async function ativar() {
    if (busy) return
    setBusy(true)
    setResultado(null)
    try { setResultado(await enviarFlowCobranca(flowId)) }
    catch { setResultado({ ok: false, error: ERRO_ATIVACAO_INCERTA }) }
    finally { setBusy(false); router.refresh() }
  }
  return <div className="space-y-2">
    <Button type="button" disabled={busy} loading={busy} loadingLabel={pausado ? 'Retomando...' : 'Ativando...'} onClick={() => void ativar()}><Play size={16} />{pausado ? 'Retomar Flow' : 'Ativar Flow'}</Button>
    {resultado?.ok === false ? <p role="alert" className="max-w-md text-sm text-rose-800">{resultado.error}</p> : null}
    {resultado?.ok === true && resultado.aviso ? <p role="status" className="max-w-md text-sm text-amber-800">{resultado.aviso}</p> : null}
  </div>
}

export function AtivacaoLoteFlows({ flows, selected, onSelectedChange, onBusyChange, onSelectAllChange }: {
  flows: any[]
  selected: string[]
  onSelectedChange: (ids: string[]) => void
  onBusyChange: (busy: boolean) => void
  onSelectAllChange: (checked: boolean) => void
}) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [progresso, setProgresso] = useState('')
  const [falhas, setFalhas] = useState<Array<{ nome: string; motivo: string }>>([])
  const prontos = flows.filter(flow => flow.status === 'pronto' && Number(flow.total_mensagens) > 0)
  const selecionados = prontos.filter(flow => selected.includes(flow.id))
  const mensagens = selecionados.reduce((sum, flow) => sum + Number(flow.total_mensagens ?? 0), 0)
  const todos = prontos.length > 0 && selecionados.length === prontos.length

  async function ativar() {
    if (busy || !selecionados.length) return
    if (!window.confirm(`Ativar ${selecionados.length} Flow(s), com ${mensagens} e-mail(s)/mensagem(ns)? Os envios serão agendados respeitando os limites de cada carteira e remetente.`)) return
    setBusy(true)
    onBusyChange(true)
    setFalhas([])
    const erros: Array<{ nome: string; motivo: string }> = []
    const restantes = new Set(selecionados.map(flow => String(flow.id)))
    let ativados = 0
    try {
      for (const [index, flow] of selecionados.entries()) {
        setProgresso(`Ativando ${index + 1} de ${selecionados.length} · ${ativados} ativado(s)`)
        try {
          const resultado = await enviarFlowCobranca(flow.id)
          if (resultado.ok === false) {
            erros.push({ nome: flow.nome, motivo: resultado.error })
            setFalhas([...erros])
            continue
          }
          ativados += 1
          restantes.delete(flow.id)
          onSelectedChange([...restantes])
          if (resultado.aviso) {
            erros.push({ nome: flow.nome, motivo: resultado.aviso })
            setFalhas([...erros])
          }
        } catch {
          erros.push({ nome: flow.nome, motivo: ERRO_ATIVACAO_INCERTA })
          setFalhas([...erros])
        }
      }
      setProgresso(`${ativados} Flow(s) ativado(s).${erros.length ? ` ${erros.length} precisa(m) de conferência.` : ''}`)
    } finally {
      setBusy(false)
      onBusyChange(false)
      router.refresh()
    }
  }

  return <div className="space-y-3 border-b border-slate-200 bg-slate-50 px-4 py-3">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <label className="inline-flex items-center gap-2 text-sm font-medium text-slate-800">
          <input type="checkbox" checked={todos} disabled={busy || !prontos.length} onChange={event => { onSelectedChange(event.target.checked ? prontos.map(flow => flow.id) : []); onSelectAllChange(event.target.checked) }} />
          Selecionar prontos desta página ({prontos.length})
        </label>
        <p className="mt-1 text-xs text-slate-500">{selecionados.length} Flow(s) selecionado(s) · {mensagens} mensagem(ns).</p>
      </div>
      <Button type="button" disabled={!selecionados.length} loading={busy} loadingLabel="Ativando flows..." onClick={() => void ativar()}>Ativar selecionados</Button>
    </div>
    {progresso ? <p role="status" aria-live="polite" className="text-sm text-slate-700">{progresso}</p> : null}
    <ImportProgressIndicator active={busy} title="Ativando flows de cobrança" steps={['Ativar flows selecionados']} currentStep={0} detail={progresso} />
    {falhas.length ? <ul role="alert" className="space-y-1 text-sm text-rose-800">{falhas.map((falha, index) => <li key={index}>{falha.nome}: {falha.motivo}</li>)}</ul> : null}
  </div>
}
