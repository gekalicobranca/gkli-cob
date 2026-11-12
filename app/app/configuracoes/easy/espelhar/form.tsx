'use client'

import { useEffect, useRef, useState } from 'react'
import { Check, ScanLine } from 'lucide-react'
import { EasyEmpty } from '@/components/easy/easy-ui'
import styles from '@/components/easy/easy.module.css'
import { dataCivilSaoPaulo } from '@/lib/core/data-civil'
import { nomeCondominioEasy } from '@/features/easy-cob/nome-condominio'
import { consultarEspelhamentos, solicitarEspelhamento } from './actions'
import type { CondominioEspelhamento } from './types'

const moeda = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
const data = (valor: string) => dataCivilSaoPaulo(new Date(valor)).split('-').reverse().join('/')
const emAndamento = (c: CondominioEspelhamento) => c.execucao?.estado === 'fila' || c.execucao?.estado === 'processando'
const rotulos: Record<string, string> = {
  cota_aberta: 'Atualizar cota', cota_paga: 'Baixa de cota', parcela_paga: 'Baixa de parcela',
  vinculo: 'Vincular recibo ao acordo', acordo_novo: 'Cadastrar acordo', acordo_cancelado: 'Cancelar acordo',
}

export function EspelharForm({ inicial, podeExecutar }: { inicial: CondominioEspelhamento[]; podeExecutar: boolean }) {
  const [condominios, setCondominios] = useState(inicial)
  const [administradora, setAdministradora] = useState('')
  const [selecionados, setSelecionados] = useState<string[]>([])
  const [aplicar, setAplicar] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [mensagem, setMensagem] = useState('')
  const [erro, setErro] = useState('')
  const lote = useRef<string | null>(null)
  const disponiveis = condominios.filter(c => !emAndamento(c))
  const selecao = disponiveis.filter(c => selecionados.includes(c.id)).map(c => c.id)
  const atualizando = condominios.some(emAndamento)
  const mesAtual = dataCivilSaoPaulo().slice(0, 7)

  useEffect(() => {
    if (!atualizando) return
    let ativo = true
    let timer: ReturnType<typeof setTimeout>
    async function atualizar() {
      try {
        const painel = await consultarEspelhamentos()
        if (ativo) setCondominios(painel)
      } catch {
        // Mantém o último resultado disponível enquanto o painel tenta atualizar.
      } finally {
        if (ativo) timer = setTimeout(atualizar, 8000)
      }
    }
    timer = setTimeout(atualizar, 8000)
    return () => { ativo = false; clearTimeout(timer) }
  }, [atualizando])

  function selecionar(ids: string[]) {
    lote.current = null
    setSelecionados(ids)
    setMensagem('')
    setErro('')
  }

  async function iniciar() {
    if (enviando || !administradora || !selecao.length) return
    setEnviando(true)
    setErro('')
    setMensagem('')
    lote.current ??= crypto.randomUUID()
    try {
      const resposta = await solicitarEspelhamento(selecao, lote.current, aplicar)
      if (resposta.error) {
        setErro(resposta.error)
        return
      }
      setCondominios(await consultarEspelhamentos())
      selecionar([])
      setMensagem(resposta.quantidade ? 'Solicitação registrada. Acompanhe o andamento na lista.' : 'As solicitações já foram registradas.')
    } catch {
      setErro('Não foi possível confirmar a solicitação. Tente novamente para atualizar o mesmo pedido.')
    } finally {
      setEnviando(false)
    }
  }

  if (!condominios.length) return <EasyEmpty title="Nenhum condomínio disponível" description="A lista mostra os condomínios da sua carteira com agente remoto e espelhamento habilitados." />

  return (
    <div className="space-y-5">
      <section className={styles.panel}>
        <label htmlFor="espelhar-administradora" className="text-sm font-semibold">Qual administradora?</label>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <select id="espelhar-administradora" className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm"
            value={administradora} disabled={enviando} onChange={event => { setAdministradora(event.target.value); selecionar([]) }}>
            <option value="">Selecione a administradora</option>
            <option value="lello">Lello</option>
          </select>
          <button type="button" className={styles.primary} disabled={!podeExecutar || !administradora || !selecao.length || enviando} onClick={iniciar}>
            <ScanLine size={16} aria-hidden="true" /> {enviando ? 'Registrando…' : aplicar ? 'Espelhar agora' : 'Conferir agora'}
          </button>
        </div>
        <label className="mt-4 inline-flex items-start gap-2 text-sm">
          <input type="checkbox" className="mt-0.5 h-4 w-4" checked={aplicar} disabled={!podeExecutar || enviando}
            onChange={event => { setAplicar(event.target.checked); lote.current = null }} />
          Aplicar ajustes comprovados no app
        </label>
        {administradora && <p className="mt-3 text-sm text-slate-600">{selecao.length} de {disponiveis.length} disponíveis selecionados.</p>}
        {mensagem && <p role="status" className="mt-3 text-sm text-cyan-900">{mensagem}</p>}
        {erro && <p role="alert" className="mt-3 text-sm text-rose-800">{erro}</p>}
      </section>
      {administradora && (
        <section className={styles.panel}>
          <h2>Condomínios da administradora</h2>
          <label className="mt-3 inline-flex items-center gap-2 text-sm font-semibold">
            <input type="checkbox" className="h-4 w-4" checked={disponiveis.length > 0 && selecao.length === disponiveis.length}
              disabled={enviando || !disponiveis.length} onChange={event => selecionar(event.target.checked ? disponiveis.map(c => c.id) : [])} />
            Selecionar todos os disponíveis
          </label>
          <ul className="mt-3 divide-y divide-slate-100">
            {condominios.map(c => {
              const execucao = c.execucao
              const resultado = execucao?.resultado
              const noMes = c.ultimoEspelhamentoEm && dataCivilSaoPaulo(new Date(c.ultimoEspelhamentoEm)).startsWith(mesAtual)
              return (
                <li key={c.id} className={`px-3 py-3 text-sm ${noMes ? 'bg-emerald-50' : ''}`}>
                  <div className="flex flex-wrap items-center gap-2">
                    <label className="inline-flex items-center gap-2 font-semibold">
                      <input type="checkbox" className="h-4 w-4" checked={selecionados.includes(c.id)} disabled={emAndamento(c) || enviando}
                        onChange={event => selecionar(event.target.checked ? [...selecionados, c.id] : selecionados.filter(id => id !== c.id))} />
                      {nomeCondominioEasy(c.nome, c.nomeOperacional)}
                    </label>
                    {c.ultimoEspelhamentoEm && <span className={styles.badge}><Check size={13} aria-hidden="true" />{noMes ? 'Espelhado no mês' : 'Último espelhamento'} · {data(c.ultimoEspelhamentoEm)}</span>}
                    {c.ultimaConferenciaEm && <span className="text-xs text-slate-600">Conferido em {data(c.ultimaConferenciaEm)}</span>}
                    {execucao?.estado === 'fila' && <span className={styles.badge}>Na fila</span>}
                    {execucao?.estado === 'processando' && <span className={styles.badge}>Processando</span>}
                  </div>
                  <p className="mt-1 text-xs text-slate-600">{c.carteira}</p>
                  {resultado?.erro && <p className="mt-2 text-sm text-rose-800">{resultado.erro}</p>}
                  {execucao?.estado === 'concluido' && resultado && (
                    <details className="mt-2">
                      <summary className="cursor-pointer text-sm font-semibold text-cyan-800">
                        {resultado.cotas} cotas em atraso · {resultado.acordos} acordos consultados · {resultado.parcelasPagas} parcelas pagas · {resultado.pendencias?.length ?? 0} pendências
                      </summary>
                      <div className="mt-2 max-h-96 overflow-y-auto">
                        <p className="font-semibold">{execucao.aplicar ? `${resultado.aplicadas ?? 0} ajustes aplicados` : `${resultado.alteracoes?.length ?? 0} ajustes identificados na conferência`}</p>
                        <ul className="mt-1 list-inside list-disc space-y-1 text-slate-700">
                          {resultado.alteracoes?.map((a, i) => <li key={i}>{a.unidade} · {rotulos[a.tipo] ?? a.tipo} · {a.recibo ?? a.numero}{a.vencimento && ` · ${a.vencimento.split('-').reverse().join('/')}`}{(a.valorPago ?? a.total) != null && ` · ${moeda.format((a.valorPago ?? a.total ?? 0) / 100)}`}</li>)}
                          {resultado.pendencias?.map((p, i) => <li key={`pendencia-${i}`}>{[p.unidade, p.tipo, p.referencia, p.vencimento?.split('-').reverse().join('/'), p.valor != null ? moeda.format(p.valor / 100) : null].filter(Boolean).join(' · ')}. {p.motivo}</li>)}
                        </ul>
                      </div>
                    </details>
                  )}
                </li>
              )
            })}
          </ul>
        </section>
      )}
    </div>
  )
}
