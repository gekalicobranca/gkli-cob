'use client'

import { createContext, useContext, useState, useTransition, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { pausarAgendasSelecionadas, limparMontagensSelecionadas } from '@/features/agente-automatico/agenda-actions'

const Selecao = createContext<{ selecionados: Set<string>; alternar: (id: string) => void; pending: boolean } | null>(null)

export function MaestroAgendaSelecao({ ids, children, montagens = false }: { ids: string[]; children: ReactNode; montagens?: boolean }) {
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set())
  const [pending, startTransition] = useTransition()
  const [resultado, setResultado] = useState<{ erro?: string; mensagem?: string }>({})
  const visiveis = ids.filter(id => selecionados.has(id))
  function alternar(id: string) {
    setSelecionados(atual => { const next = new Set(atual); if (next.has(id)) next.delete(id); else next.add(id); return next })
  }
  function pausar() {
    setResultado({})
    startTransition(async () => {
      try {
        const resposta = await (montagens ? limparMontagensSelecionadas(visiveis) : pausarAgendasSelecionadas(visiveis))
        setResultado(resposta)
        if (!resposta.erro) setSelecionados(new Set())
      } catch { setResultado({ erro: 'Não foi possível concluir a ação. Tente novamente.' }) }
    })
  }
  return <Selecao.Provider value={{ selecionados, alternar, pending }}>
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white p-4">
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={ids.length > 0 && visiveis.length === ids.length} disabled={pending || !ids.length} onChange={event => setSelecionados(event.target.checked ? new Set(ids) : new Set())} />{montagens ? 'Selecionar montagens pendentes exibidas' : 'Selecionar todas as agendas filtradas'}</label>
        <span className="text-sm text-slate-500">{visiveis.length} selecionada(s)</span>
        <Button type="button" variant="secondary" disabled={pending || !visiveis.length} onClick={pausar}>{pending ? 'Aplicando...' : montagens ? 'Limpar montagens selecionadas' : 'Pausar selecionadas'}</Button>
        <p className="w-full text-xs text-slate-500">{montagens ? 'Encerra e arquiva montagens na fila ou com atenção. Flows já criados e histórico são preservados.' : 'Pausa a agenda recorrente e cancela execuções agendadas ainda pendentes. Execuções em andamento continuam.'}</p>
        {resultado.erro ? <p role="alert" className="w-full text-sm text-rose-700">{resultado.erro}</p> : null}
        {resultado.mensagem ? <p role="status" className="w-full text-sm text-emerald-700">{resultado.mensagem}</p> : null}
      </div>
      {children}
    </div>
  </Selecao.Provider>
}

export function MaestroAgendaCheckbox({ id, nome, montagens = false }: { id: string; nome: string; montagens?: boolean }) {
  const contexto = useContext(Selecao)
  if (!contexto) return null
  return <input type="checkbox" aria-label={`Selecionar ${montagens ? 'montagem' : 'agenda'} de ${nome}`} checked={contexto.selecionados.has(id)} disabled={contexto.pending} onChange={() => contexto.alternar(id)} className="h-4 w-4 shrink-0 accent-[var(--gkli-primary)]" />
}
