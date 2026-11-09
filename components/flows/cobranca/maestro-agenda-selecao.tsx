'use client'

import { createContext, useContext, useState, useTransition, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { arquivarMontagensConcluidas, limparMontagensSelecionadas, pausarAgendasSelecionadas } from '@/features/agente-automatico/agenda-actions'

const Selecao = createContext<{ selecionados: Set<string>; alternar: (id: string) => void; pending: boolean } | null>(null)

export function MaestroAgendaSelecao({ ids, idsConcluidas = [], children, montagens = false }: {
  ids: string[]; idsConcluidas?: string[]; children: ReactNode; montagens?: boolean
}) {
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set())
  const [pending, startTransition] = useTransition()
  const [resultado, setResultado] = useState<{ erro?: string; mensagem?: string }>({})
  const acoes = [{
    ids,
    selecionar: montagens ? 'Selecionar montagens pendentes exibidas' : 'Selecionar todas as agendas filtradas',
    botao: montagens ? 'Limpar montagens selecionadas' : 'Pausar selecionadas',
    descricao: montagens
      ? 'Encerra e arquiva montagens na fila ou com atenção. Flows já criados e histórico são preservados.'
      : 'Pausa a agenda recorrente e cancela execuções agendadas ainda pendentes. Execuções em andamento continuam.',
    executar: montagens ? limparMontagensSelecionadas : pausarAgendasSelecionadas,
  }]
  if (montagens && idsConcluidas.length) acoes.push({
    ids: idsConcluidas,
    selecionar: 'Selecionar montagens concluídas exibidas',
    botao: 'Arquivar concluídas selecionadas',
    descricao: 'As montagens passam para o filtro Arquivadas, com os flows e o histórico preservados.',
    executar: arquivarMontagensConcluidas,
  })
  function alternar(id: string) {
    setSelecionados(atual => { const next = new Set(atual); if (next.has(id)) next.delete(id); else next.add(id); return next })
  }
  function selecionarGrupo(grupo: string[], marcado: boolean) {
    setSelecionados(atual => {
      const next = new Set(atual)
      for (const id of grupo) {
        if (marcado) next.add(id)
        else next.delete(id)
      }
      return next
    })
  }

  function aplicar(acao: typeof acoes[number], selecao: string[]) {
    setResultado({})
    startTransition(async () => {
      try {
        const resposta = await acao.executar(selecao)
        setResultado(resposta)
        if (!resposta.erro) selecionarGrupo(selecao, false)
      } catch { setResultado({ erro: 'Não foi possível concluir a ação. Tente novamente.' }) }
    })
  }
  return <Selecao.Provider value={{ selecionados, alternar, pending }}>
    <div className="space-y-3">
      {acoes.map(acao => {
        const selecao = acao.ids.filter(id => selecionados.has(id))
        return <div key={acao.botao} className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white p-4">
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={acao.ids.length > 0 && selecao.length === acao.ids.length} disabled={pending || !acao.ids.length} onChange={event => selecionarGrupo(acao.ids, event.target.checked)} />{acao.selecionar}</label>
          <span className="text-sm text-slate-500">{selecao.length} selecionada(s)</span>
          <Button type="button" variant="secondary" disabled={pending || !selecao.length} onClick={() => aplicar(acao, selecao)}>{pending ? 'Aplicando...' : acao.botao}</Button>
          <p className="w-full text-xs text-slate-500">{acao.descricao}</p>
        </div>
      })}
        {resultado.erro ? <p role="alert" className="w-full text-sm text-rose-700">{resultado.erro}</p> : null}
        {resultado.mensagem ? <p role="status" className="w-full text-sm text-emerald-700">{resultado.mensagem}</p> : null}
      {children}
    </div>
  </Selecao.Provider>
}

export function MaestroAgendaCheckbox({ id, nome, montagens = false }: { id: string; nome: string; montagens?: boolean }) {
  const contexto = useContext(Selecao)
  if (!contexto) return null
  return <input type="checkbox" aria-label={`Selecionar ${montagens ? 'montagem' : 'agenda'} de ${nome}`} checked={contexto.selecionados.has(id)} disabled={contexto.pending} onChange={() => contexto.alternar(id)} className="h-4 w-4 shrink-0 accent-[var(--gkli-primary)]" />
}
