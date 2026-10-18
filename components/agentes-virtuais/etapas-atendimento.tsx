'use client'

import { useSyncExternalStore, type ReactNode } from 'react'
import { ArrowDown, X } from 'lucide-react'

export type EtapaAtendimento = { id: string; titulo: string; situacao: string; descricao: string; conteudo: ReactNode }
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
        return <button key={etapa.id} id={`abrir-${etapa.id}`} type="button"
          aria-expanded={ativa} aria-controls={etapa.id}
          onClick={() => selecionar(ativa ? 'detalhes-caso' : etapa.id)}
          className={`flex min-w-0 flex-col rounded-xl border p-4 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-700 ${ativa ? 'border-cyan-600 bg-cyan-50 ring-1 ring-cyan-600' : 'border-slate-200 bg-white hover:border-cyan-400 hover:bg-slate-50'}`}>
          <span className="flex w-full items-center justify-between gap-2"><span className={`flex size-7 items-center justify-center rounded-full text-xs font-semibold ${ativa ? 'bg-cyan-700 text-white' : 'bg-slate-100 text-slate-600'}`}>{index + 1}</span><ArrowDown className={`size-4 text-cyan-700 transition-transform ${ativa ? 'rotate-180' : ''}`} aria-hidden="true" /></span>
          <span className="mt-3 font-semibold text-slate-900">{etapa.titulo}</span>
          <span className="mt-1 text-sm font-medium text-cyan-800">{etapa.situacao}</span>
          <span className="mt-2 text-xs leading-relaxed text-slate-500">{etapa.descricao}</span>
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
