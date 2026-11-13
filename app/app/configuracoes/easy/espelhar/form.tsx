'use client'

import { useEffect, useRef, useState } from 'react'
import { Check, ScanLine } from 'lucide-react'
import { EasyEmpty } from '@/components/easy/easy-ui'
import styles from '@/components/easy/easy.module.css'
import { dataCivilSaoPaulo } from '@/lib/core/data-civil'
import { nomeCondominioEasy } from '@/features/easy-cob/nome-condominio'
import { aplicarContatoEspelhado, aprovarBorderoEspelhado, configurarAgendaEspelhamento, consultarDetalheEspelhamento, consultarEspelhamentos, entregarPreJuridico, prepararFlowEspelhado, solicitarEspelhamento } from './actions'
import type { CondominioEspelhamento, ResultadoEspelhamento } from './types'

const moeda = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
const data = (valor: string) => dataCivilSaoPaulo(new Date(valor)).split('-').reverse().join('/')
const emAndamento = (c: CondominioEspelhamento) => c.execucao?.estado === 'fila' || c.execucao?.estado === 'processando'
const rotulos: Record<string, string> = {
  cota_aberta: 'Atualizar cota', cota_paga: 'Baixa de cota', parcela_paga: 'Baixa de parcela',
  vinculo: 'Vincular recibo ao acordo', acordo_novo: 'Cadastrar acordo', acordo_cancelado: 'Cancelar acordo',
  parcela_paga_extrato: 'Baixa de parcela', repasse_creditado: 'Confirmar crédito de repasse',
}

export function EspelharForm({ inicial, podeExecutar, podeAprovarBordero }: { inicial: CondominioEspelhamento[]; podeExecutar: boolean; podeAprovarBordero: boolean }) {
  const [condominios, setCondominios] = useState(inicial)
  const [administradora, setAdministradora] = useState('')
  const [selecionados, setSelecionados] = useState<string[]>([])
  const [aplicar, setAplicar] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [mensagem, setMensagem] = useState('')
  const [erro, setErro] = useState('')
  const [entregando, setEntregando] = useState<string | null>(null)
  const [entregas, setEntregas] = useState<Record<string, { error?: string; mensagem?: string }>>({})
  const [detalhes, setDetalhes] = useState<Record<string, ResultadoEspelhamento | 'carregando' | 'erro'>>({})
  const lote = useRef<string | null>(null)
  const campoAnexo = useRef<HTMLInputElement>(null)
  const administradoras = [...new Set(condominios.flatMap(c => c.administradoras))].sort((a, b) => a.localeCompare(b, 'pt-BR'))
  const condominiosDaAdministradora = condominios.filter(c => c.administradoras.includes(administradora))
  const disponiveis = condominiosDaAdministradora.filter(c => !emAndamento(c))
  const selecao = disponiveis.filter(c => selecionados.includes(c.id)).map(c => c.id)
  const atualizando = condominios.some(emAndamento)
  const mesAtual = dataCivilSaoPaulo().slice(0, 7)

  useEffect(() => {
    if (!atualizando) return
    let ativo = true
    let timer: ReturnType<typeof setTimeout>
    async function atualizar() {
      try {
        if (!document.hidden) {
          const painel = await consultarEspelhamentos()
          if (ativo) setCondominios(painel)
        }
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
    if (campoAnexo.current) campoAnexo.current.value = ''
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
      const arquivo = campoAnexo.current?.files?.[0]
      const anexo = arquivo ? new FormData() : undefined
      if (arquivo && anexo) anexo.set('demonstrativo', arquivo)
      const resposta = await solicitarEspelhamento(selecao, lote.current, aplicar, administradora, anexo)
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

  async function carregarDetalhe(id: string) {
    if (detalhes[id] && detalhes[id] !== 'erro') return
    setDetalhes(atuais => ({ ...atuais, [id]: 'carregando' }))
    try {
      const resultado = await consultarDetalheEspelhamento(id)
      setDetalhes(atuais => ({ ...atuais, [id]: resultado ?? 'erro' }))
    } catch {
      setDetalhes(atuais => ({ ...atuais, [id]: 'erro' }))
    }
  }

  async function executarAcao(chave: string, acao: () => Promise<{ error?: string; mensagem?: string }>) {
    setEntregando(chave)
    try {
      const resultado = await acao()
      setEntregas(anterior => ({ ...anterior, [chave]: resultado }))
    } catch {
      setEntregas(anterior => ({ ...anterior, [chave]: { error: 'Não foi possível confirmar a operação.' } }))
    } finally {
      setEntregando(null)
    }
  }

  function acaoEspelho(chave: string, rotulo: string, acao: () => Promise<{ error?: string; mensagem?: string }>) {
    const entrega = entregas[chave]
    return <>
      {!entrega?.mensagem && <button type="button" disabled={entregando !== null} onClick={() => executarAcao(chave, acao)} className="ml-2 font-semibold text-cyan-800">{entregando === chave ? 'Processando…' : rotulo}</button>}
      {entrega?.mensagem && <span role="status" className="ml-2 text-emerald-800">{entrega.mensagem}</span>}
      {entrega?.error && <span role="alert" className="ml-2 text-rose-800">{entrega.error}</span>}
    </>
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
            {administradoras.map(nome => <option key={nome} value={nome}>{nome}</option>)}
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
        {podeExecutar && selecao.length === 1 && (
          <details className="mt-3 text-sm">
            <summary className="cursor-pointer font-semibold">Anexar demonstrativo de repasses</summary>
            <label htmlFor="espelhar-demonstrativo" className="mt-2 block">CSV da administradora, até 256 KB</label>
            <p id="espelhar-colunas" className="mt-1 text-xs text-slate-600">Colunas separadas por ponto e vírgula: CNPJ, Recibo, Referência do repasse, Data de crédito do repasse e Valor do repasse creditado.</p>
            <input ref={campoAnexo} id="espelhar-demonstrativo" type="file" accept=".csv,text/csv" aria-describedby="espelhar-colunas"
              className="mt-2 block w-full" disabled={enviando} onChange={() => { lote.current = null }} />
          </details>
        )}
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
            {condominiosDaAdministradora.map(c => {
              const execucao = c.execucao
              const resumo = execucao?.resumo
              const detalhe = execucao && detalhes[execucao.id]
              const resultado = typeof detalhe === 'object' ? detalhe : null
              const primeiroReciboPorCanal = new Map<string, number>()
              resultado?.contatosEFlows?.candidatas.forEach((r, i) => r.canais.forEach(canal => {
                const chave = `${r.unidadeId}:${canal}`
                if (!primeiroReciboPorCanal.has(chave)) primeiroReciboPorCanal.set(chave, i)
              }))
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
                  {podeAprovarBordero && c.agendado !== undefined && acaoEspelho(`${c.id}:agenda:${c.agendado}`, c.agendado ? 'Desativar conferência mensal' : 'Ativar conferência mensal', async () => {
                    const retorno = await configurarAgendaEspelhamento(c.id, !c.agendado)
                    if (retorno.error) return retorno
                    setCondominios(anteriores => anteriores.map(item => item.id === c.id ? { ...item, agendado: !c.agendado } : item))
                    return {}
                  })}
                  {resumo?.erro && <p className="mt-2 text-sm text-rose-800">{resumo.erro}</p>}
                  {execucao?.estado === 'concluido' && resumo && (
                    <details key={execucao.id} className="mt-2" onToggle={event => {
                      if (event.currentTarget.open && !detalhe) void carregarDetalhe(execucao.id)
                    }}>
                      <summary className="cursor-pointer text-sm font-semibold text-cyan-800">
                        {resumo.cotas} cotas em atraso · {resumo.acordos == null ? 'acordos sem demonstrativo' : `${resumo.acordos} acordos consultados`} · {resumo.parcelasPagas} parcelas confirmadas · {resumo.pendencias} pendências
                      </summary>
                      {detalhe === 'carregando' && <p role="status" className="mt-2">Carregando resultado…</p>}
                      {detalhe === 'erro' && <button type="button" className="mt-2 text-cyan-800 underline" onClick={() => carregarDetalhe(execucao.id)}>Tentar carregar o resultado novamente</button>}
                      {resultado && <>
                      <div className="mt-2 max-h-96 overflow-y-auto">
                        <p className="font-semibold">{execucao.aplicar ? `${resultado.aplicadas ?? 0} ajustes aplicados` : `${resultado.alteracoes?.length ?? 0} ajustes identificados na conferência`}</p>
                        <ul className="mt-1 list-inside list-disc space-y-1 text-slate-700">
                          {resultado.repasses?.map((r, i) => <li key={`repasse-${i}`}>{r.unidade} · {r.recibo} · {r.dataCredito.split('-').reverse().join('/')} · {moeda.format(r.valor / 100)} · {r.estado}</li>)}
                          {resultado.alteracoes?.map((a, i) => <li key={i}>{a.unidade} · {rotulos[a.tipo] ?? a.tipo} · {a.recibo ?? a.numero}{a.vencimento && ` · ${a.vencimento.split('-').reverse().join('/')}`}{(a.valorPago ?? a.total) != null && ` · ${moeda.format((a.valorPago ?? a.total ?? 0) / 100)}`}</li>)}
                          {resultado.pendencias?.map((p, i) => <li key={`pendencia-${i}`}>{[p.unidade, p.tipo, p.referencia, p.vencimento?.split('-').reverse().join('/'), p.valor != null ? moeda.format(p.valor / 100) : null].filter(Boolean).join(' · ')}. {p.motivo}{p.valorSalvo != null && ` Valor registrado: ${moeda.format(p.valorSalvo / 100)}.`}</li>)}
                        </ul>
                      </div>
                      {resultado.contatosEFlows && (
                        <details className="mt-3 rounded-lg border border-slate-200 p-3">
                          <summary className="cursor-pointer font-semibold text-cyan-800">Contatos e flows · {resultado.contatosEFlows.contatosConferidos} fichas conferidas · {resultado.contatosEFlows.candidatas.length} recibos candidatos</summary>
                          <ul className="mt-2 max-h-64 space-y-1 overflow-y-auto text-xs text-slate-600">
                            {resultado.contatosEFlows.revisoes.map((r, i) => <li key={i}>{r.unidade}{r.bloco && ` / ${r.bloco}`} · {r.motivo}{podeExecutar && r.unidadeId && r.revisao && acaoEspelho(`${execucao.id}:contato:${r.unidadeId}`, 'Atualizar cadastro', () => aplicarContatoEspelhado(execucao.id, r.unidadeId!))}</li>)}
                            {resultado.contatosEFlows.candidatas.map((r, i) => <li key={`flow-${i}`}>{r.unidade}{r.bloco && ` / ${r.bloco}`} · {r.recibo} · {r.canais.map(c => c === 'whatsapp' ? 'WhatsApp' : 'E-mail').join(' e ')} · {moeda.format(r.saldoCentavos / 100)}
                              {podeExecutar && r.unidadeId && (['email', 'whatsapp'] as const).filter(canal => primeiroReciboPorCanal.get(`${r.unidadeId}:${canal}`) === i)
                                .map(canal => <span key={canal}>{acaoEspelho(`${execucao.id}:flow:${r.unidadeId}:${canal}`, `Preparar ${canal === 'email' ? 'e-mail' : 'WhatsApp'} da unidade`, () => prepararFlowEspelhado(execucao.id, r.unidadeId, canal))}</span>)}
                            </li>)}
                          </ul>
                        </details>
                      )}
                      {[resultado.bordero, resultado.borderoAnterior].map(bordero => bordero && (
                        <details key={bordero.fim} className="mt-3 rounded-lg border border-slate-200 p-3">
                          <summary className="cursor-pointer font-semibold text-cyan-800">Prévia do borderô · {moeda.format(bordero.totalCentavos / 100)} · {bordero.pendencias.length} pendências</summary>
                          <p className="mt-2 text-xs text-slate-600">{bordero.inicio.split('-').reverse().join('/')} a {bordero.fim.split('-').reverse().join('/')}</p>
                          <ul className="mt-2 max-h-64 space-y-1 overflow-y-auto text-xs text-slate-600">
                            {bordero.linhas.map(l => <li key={l.parcelaId}>{l.descricao} {l.credito ? `Crédito de ${moeda.format(l.credito.valorCentavos / 100)} em ${l.credito.data.split('-').reverse().join('/')}.` : 'Crédito a confirmar.'}</li>)}
                            {bordero.pendencias.map(p => <li key={p.parcelaId}>{p.unidade} · {p.numero ?? 'Acordo sem referência externa'} · parcela {p.parcela}. {p.motivo}</li>)}
                          </ul>
                          {podeAprovarBordero && bordero.periodoId && bordero.totalCentavos > 0 && (resultado.preJuridico?.dataBase ?? '') >= bordero.fim
                            && acaoEspelho(`${execucao.id}:bordero:${bordero.fim}`, 'Aprovar borderô para o fechamento', () => aprovarBorderoEspelhado(execucao.id, bordero.fim))}
                        </details>
                      ))}
                      {!!resultado.homologacoes?.length && (
                        <details className="mt-3 rounded-lg border border-slate-200 p-3">
                          <summary className="cursor-pointer font-semibold text-cyan-800">Conferência para homologação · {resultado.homologacoes.length} acordos</summary>
                          <ul className="mt-2 max-h-64 space-y-1 overflow-y-auto text-xs text-slate-600">
                            {resultado.homologacoes.map(a => <li key={a.acordoId}>{a.unidade} · {a.numero} · {a.composicaoConferida && a.condicoesConferidas ? 'Cotas, condições e parcelas conferidas' : 'Divergência na composição ou nas condições'} · <a className="underline" href={a.documento} target="_blank" rel="noreferrer">Manutenção na Lello</a> · <a className="underline" href={`/app/acordos/${a.acordoId}`}>Abrir acordo e anexar PDF</a></li>)}
                          </ul>
                        </details>
                      )}
                      {resultado.preJuridico && (
                        <details className="mt-3 rounded-lg border border-slate-200 p-3">
                          <summary className="cursor-pointer font-semibold text-cyan-800">Prévia do Pré-Jurídico · {resultado.preJuridico.unidades.length} unidades · {resultado.preJuridico.quantidadeCotas} cotas · {moeda.format(resultado.preJuridico.saldoCentavos / 100)}</summary>
                          <p className="mt-2 text-xs text-slate-600">Mínimo de {resultado.preJuridico.minimoCotas ?? 2} cotas em atraso. O saldo soma apenas as cotas que atingiram D+{resultado.preJuridico.prazoDias}. {resultado.preJuridico.habilitado ? 'Triagem para conferência.' : 'Pré-Jurídico desabilitado para o condomínio ou a carteira.'}</p>
                          {!!resultado.preJuridico.revisoesJudiciais?.length && <div className="mt-2 text-xs text-slate-700">
                            <p className="font-semibold">Cotas posteriores ao acordo judicial · conferir cláusula e pagamento</p>
                            <ul>{resultado.preJuridico.revisoesJudiciais.map(r => <li key={r.acordoId}><a className="underline" href={`/app/acordos/${r.acordoId}`}>{r.unidade} · {r.processo ?? 'Processo a conferir'}</a> · {r.cotas.map(c => `${c.recibo} (${c.vencimento.split('-').reverse().join('/')}, ${moeda.format(c.saldoCentavos / 100)})`).join(', ')}</li>)}</ul>
                          </div>}
                          <ul className="mt-2 max-h-80 space-y-2 overflow-y-auto">
                            {resultado.preJuridico.unidades.map(unidade => {
                              const chave = `${execucao.id}:${unidade.unidadeId}`
                              return <li key={unidade.unidadeId ?? unidade.unidade}>
                                <details>
                                  <summary className="cursor-pointer">{unidade.unidade} · {unidade.cotas.length} de {unidade.totalEmAtraso} cotas · {moeda.format(unidade.saldoCentavos / 100)}{unidade.exigeRevisaoVinculo && ' · Vínculo a conferir'}</summary>
                                  <ul className="ml-4 mt-1 text-xs text-slate-600">
                                    {unidade.cotas.map(cota => <li key={cota.recibo}>{cota.recibo} · {cota.competencia ?? 'Competência a conferir'} · {cota.vencimento.split('-').reverse().join('/')} · {moeda.format(cota.saldoCentavos / 100)}{!cota.vinculoExato && ' · Correspondência por vencimento e principal'}</li>)}
                                  </ul>
                                  {!!unidade.recibosParaVincular?.length && !execucao.aplicar && <p className="text-xs text-slate-600">Recibos identificados. Aplique o espelhamento para gravar os vínculos.</p>}
                                  {podeExecutar && resultado.preJuridico.habilitado && unidade.unidadeId && !unidade.exigeRevisaoVinculo && (execucao.aplicar || !unidade.recibosParaVincular?.length) && acaoEspelho(chave, 'Encaminhar dossiê ao Pré-Jurídico', () => entregarPreJuridico(execucao.id, unidade.unidadeId))}
                                </details>
                              </li>
                            })}
                          </ul>
                        </details>
                      )}
                      </>}
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
