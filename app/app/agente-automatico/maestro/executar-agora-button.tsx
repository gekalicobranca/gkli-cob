'use client'

import { Loader2, Play } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { ImportProgressIndicator } from '@/components/feedback/import-progress-indicator'
import { Button } from '@/components/ui/button'
import { executarAgenteReceitaComAcompanhamento } from '@/features/agente-automatico/actions'

const steps = [
  'Criando execução',
  'Aguardando agente remoto',
  'Captando relatório',
  'Convertendo arquivo',
  'Importando cobranças',
  'Aplicando régua',
]

type ProgressState = 'running' | 'completed' | 'error'

export function ExecutarAgoraButton({ receitaId, condominioNome, disabled = false }: { receitaId: string; condominioNome: string; disabled?: boolean }) {
  const router = useRouter()
  const [submitting, setSubmitting] = useState(false)
  const [execucaoId, setExecucaoId] = useState<string | null>(null)
  const [visible, setVisible] = useState(false)
  const [state, setState] = useState<ProgressState>('running')
  const [currentStep, setCurrentStep] = useState(0)
  const [detail, setDetail] = useState('Preparando a execução manual')

  useEffect(() => {
    if (!execucaoId || state !== 'running') return
    let cancelled = false
    let timer: number | undefined

    const poll = async () => {
      try {
        const response = await fetch(`/api/agente-automatico/execucoes/${execucaoId}/status`, { cache: 'no-store' })
        const result = await response.json()
        if (!response.ok || result?.ok === false) throw new Error(result?.error || 'Falha ao consultar a execução.')
        if (cancelled) return
        setCurrentStep(Number(result.currentStep ?? 1))
        setDetail(String(result.detail ?? 'Execução em andamento'))
        setState(result.state as ProgressState)
        router.refresh()
        if (result.state === 'running') timer = window.setTimeout(poll, 2500)
      } catch (error) {
        if (cancelled) return
        setState('error')
        setDetail(error instanceof Error ? error.message : 'Não foi possível acompanhar a execução.')
      }
    }

    timer = window.setTimeout(poll, 800)
    return () => {
      cancelled = true
      if (timer) window.clearTimeout(timer)
    }
  }, [execucaoId, router, state])

  useEffect(() => {
    if (!visible || state !== 'completed') return
    const timer = window.setTimeout(() => setVisible(false), 5000)
    return () => window.clearTimeout(timer)
  }, [state, visible])

  async function executar() {
    setSubmitting(true)
    setVisible(true)
    setState('running')
    setCurrentStep(0)
    setDetail('Criando execução no Maestro')
    const formData = new FormData()
    formData.set('receita_id', receitaId)
    const result = await executarAgenteReceitaComAcompanhamento(formData)
    setSubmitting(false)
    if ('error' in result) {
      setState('error')
      setDetail(result.error)
      return
    }
    setExecucaoId(result.execucaoId)
    setCurrentStep(1)
    setDetail('Execução criada; aguardando o agente remoto')
    router.refresh()
  }

  const running = submitting || (visible && state === 'running')

  return <>
    <Button size="sm" type="button" variant="secondary" disabled={disabled || running} onClick={executar}>
      {running ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
      {running ? 'Em execução' : 'Executar agora'}
    </Button>
    <ImportProgressIndicator
      active={visible}
      title={`Executando ${condominioNome}`}
      steps={steps}
      currentStep={currentStep}
      detail={detail}
      state={state}
      onClose={state === 'running' ? undefined : () => setVisible(false)}
    />
  </>
}
