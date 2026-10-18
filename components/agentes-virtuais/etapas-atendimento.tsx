'use client'

import { useSyncExternalStore, type ReactNode } from 'react'
import { ArrowDown, CircleAlert, X } from 'lucide-react'
import type { AtencaoEtapa } from '@/features/keila/atencao-etapas'

export type EtapaAtendimento = { id: string; titulo: string; situacao: string; descricao: string; conteudo: ReactNode; atencao?: AtencaoEtapa }
const coresAlerta = {
  atencao: 'border-amber-300 bg-amber-50', urgente: 'border-rose-300 bg-rose-50',
  humana: 'border-violet-300 bg-violet-50', aguardando: 'border-sky-300 bg-sky-50',
}
const coresSelo = {
  atencao: 'bg-amber-100 text-amber-950', urgente: 'bg-rose-100 text-rose-950',
  humana: 'bg-violet-100 text-violet-950', aguardando: 'bg-sky-100 text-sky-950',
}
const eventoSelecao = 'atendimento:etapa'
function subscribe(callback: () => void) {
  window.addEventListener('hashchange', callback)
  window.addEventListener('popstate', callback)
  window.addEventListener(eventoSelecao, callback)
  return () => {
    window.removeEventListener('hashchange', callback)
    window.removeEventListener('popstate', callback)
    window.removeEventListener(eventoSelecao, callback)
  }
}
function hashAtual() { return window.location.hash.slice(1) }
function hashServidor() { return '' }
function selecionar(id: string) {
  window.history.replaceState(window.history.state, '', `#${id}`)
  window.dispatchEvent(new Event(eventoSelecao))
}
function fechar(id: string) {
  selecionar('detalhes-caso')
  document.getElementById(`abrir-${id}`)?.focus()
}

export function EtapasAtendimento({ etapas }: { etapas: EtapaAtendimento[] }) {
  const hash = useSyncExternalStore(subscribe, hashAtual, hashServidor)
  const selecionada = etapas.find(etapa => etapa.id === hash)
  return <div className="space-y-4">
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5" aria-label="Etapas do atendimento">
      {etapas.map((etapa, index) => {
        const ativa = selecionada?.id === etapa.id
        const alerta = etapa.atencao?.alerta
        const pendencias = etapa.atencao?.pendencias ?? 0
        const cor = alerta ? coresAlerta[alerta.tom] : pendencias ? coresAlerta.atencao : 'border-slate-200 bg-white'
        return <button key={etapa.id} id={`abrir-${etapa.id}`} type="button"
          aria-expanded={ativa} aria-controls={etapa.id}
          aria-current={etapa.atencao?.principal ? 'step' : undefined}
          onClick={() => selecionar(ativa ? 'detalhes-caso' : etapa.id)}
          className={`flex min-w-0 flex-col rounded-xl border p-4 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-700 ${cor} ${ativa ? 'ring-2 ring-cyan-600' : 'hover:border-cyan-500'}`}>
          <span className="flex w-full items-center justify-between gap-2"><span className={`flex size-7 items-center justify-center rounded-full text-xs font-semibold ${ativa ? 'bg-cyan-700 text-white' : 'bg-slate-100 text-slate-600'}`}>{index + 1}</span><ArrowDown className={`size-4 text-cyan-700 transition-transform ${ativa ? 'rotate-180' : ''}`} aria-hidden="true" /></span>
          <span className="mt-3 font-semibold text-slate-900">{etapa.titulo}</span>
          {alerta ? <span className={`mt-2 inline-flex items-center gap-1 self-start rounded-md px-2 py-1 text-xs font-semibold ${coresSelo[alerta.tom]}`}><CircleAlert className="size-3.5 shrink-0" aria-hidden="true" />Próximo passo</span> : null}
          <span className="mt-1 text-sm font-medium text-cyan-800">{etapa.situacao}</span>
          {alerta ? <><span className="mt-2 text-sm font-semibold text-slate-900">{alerta.titulo}</span><span className="mt-1 text-xs leading-relaxed text-slate-700">{alerta.descricao}</span></> : <span className="mt-2 text-xs leading-relaxed text-slate-500">{etapa.descricao}</span>}
          {pendencias ? <span className="mt-3 space-y-1 border-t border-slate-200 pt-2 text-xs text-slate-800"><span className="block font-semibold">{pendencias} {pendencias === 1 ? 'pendência aberta' : 'pendências abertas'}</span>{etapa.atencao?.prazo ? <span className="block">Prazo: {etapa.atencao.prazo.split('-').reverse().join('/')}{etapa.atencao.vencidas ? ' · até hoje' : ''}</span> : null}</span> : null}
        </button>
      })}
    </div>
    {!selecionada ? <p className="py-3 text-center text-sm text-slate-500">Selecione uma etapa para abrir os detalhes abaixo.</p> : null}
    {/* Preserva alterações nos formulários ao trocar de etapa. */}
    {etapas.map(etapa => <section key={etapa.id} id={etapa.id} hidden={selecionada?.id !== etapa.id}
      aria-labelledby={`abrir-${etapa.id}`} className="scroll-mt-4 rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-4"><h3 className="font-semibold">{etapa.titulo}</h3><button type="button" onClick={() => fechar(etapa.id)} aria-label={`Fechar etapa ${etapa.titulo}`} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-cyan-700"><X className="size-4" aria-hidden="true" /></button></div>
      <div className="space-y-4 p-4 sm:p-5">{etapa.conteudo}</div>
    </section>)}
  </div>
}
