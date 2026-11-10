'use client'

import Link from 'next/link'
import { Check, Play } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import styles from '@/components/easy/easy.module.css'
import { formatarVencimentoAcordo } from '@/features/acordos/formatar-vencimento'
import { captarEasyMaestro, consultarEasyMaestro, type PainelEasyMaestro, type ReceitaEasyMaestro } from './actions'

const estados: Record<ReceitaEasyMaestro['estado'], string> = {
  disponivel: 'Disponível',
  fila: 'Na fila',
  captando: 'Captando',
  importando: 'Importando',
  importado: 'Importado',
  sem_inadimplencia: 'Sem inadimplência',
  revisar: 'Revisar',
}
const emAndamento = (receita: ReceitaEasyMaestro) => ['fila', 'captando', 'importando'].includes(receita.estado)
const montandoFlow = (receita: ReceitaEasyMaestro) => receita.estado === 'importado' && receita.montarFlow
  && !['concluido', 'atencao'].includes(receita.montagemStatus ?? '')

export function EasyMaestro({ inicial, podeCaptar }: { inicial: PainelEasyMaestro; podeCaptar: boolean }) {
  const [painel, setPainel] = useState(inicial)
  const [administradora, setAdministradora] = useState('')
  const [selecionados, setSelecionados] = useState<string[]>([])
  const [montarFlow, setMontarFlow] = useState(true)
  const [enviando, setEnviando] = useState(false)
  const [mensagem, setMensagem] = useState('')
  const [erro, setErro] = useState('')
  const pedido = useRef<string | null>(null)
  const administradoras = new Map(inicial.receitas.map(r => [r.administradora, r.administradoraNome]))
  const receitas = painel.receitas.filter(r => r.administradora === administradora)
  const primeiraReceita = new Map<string, string>()
  for (const receita of receitas) {
    if (!primeiraReceita.has(receita.condominioId)) primeiraReceita.set(receita.condominioId, receita.id)
  }
  const emPrazo = new Set(receitas.filter(r => r.liberada && !emAndamento(r)).map(r => r.condominioId))
  const atualizando = receitas.some(r => emAndamento(r) || montandoFlow(r))
  const captacaoEmAndamento = receitas.some(r => r.easy && emAndamento(r))
  const montagemEmAndamento = receitas.find(r => r.easy && montandoFlow(r))
  const loteEmAndamento = captacaoEmAndamento || Boolean(montagemEmAndamento)
  let motivoBloqueio = ''
  if (!painel.ativo) motivoBloqueio = 'A captação está desligada no Maestro.'
  else if (!podeCaptar) motivoBloqueio = 'Seu perfil não tem permissão para iniciar captações.'
  else if (enviando) motivoBloqueio = 'Registrando o pedido de captação.'
  else if (captacaoEmAndamento) motivoBloqueio = 'Aguarde a captação em andamento nesta administradora.'
  else if (montagemEmAndamento) motivoBloqueio = `Aguarde a montagem do flow de ${montagemEmAndamento.condominio}.`
  const disponiveis = motivoBloqueio ? 0 : emPrazo.size
  const selecaoDisponivel = selecionados.filter(id => emPrazo.has(id))

  function atualizarSelecao(ids: string[]) {
    pedido.current = null
    setSelecionados(ids)
    setMensagem('')
    setErro('')
  }

  useEffect(() => {
    if (!administradora || enviando) return
    let cancelado = false
    let timer: ReturnType<typeof setTimeout>
    async function atualizar() {
      try {
        const resultado = await consultarEasyMaestro(administradora)
        if (!cancelado) {
          setPainel(atual => ({
            ativo: resultado.ativo,
            receitas: [...atual.receitas.filter(r => r.administradora !== administradora), ...resultado.receitas],
          }))
        }
      } catch {
        // Mantém a última leitura e tenta novamente.
      } finally {
        if (!cancelado && atualizando) timer = setTimeout(atualizar, 8000)
      }
    }
    void atualizar()
    return () => { cancelado = true; clearTimeout(timer) }
  }, [administradora, atualizando, enviando])

  async function captar() {
    if (!administradora || disponiveis === 0 || !selecaoDisponivel.length) return
    setEnviando(true)
    setErro('')
    setMensagem('')
    pedido.current ??= crypto.randomUUID()
    try {
      const resultado = await captarEasyMaestro(administradora, pedido.current, montarFlow, selecaoDisponivel)
      if (resultado.error) {
        pedido.current = null
        setErro(resultado.error)
        return
      }
      setMensagem(resultado.criadas
        ? `${resultado.criadas} pedido(s) registrado(s) na fila do Maestro.`
        : 'As captações selecionadas já têm pedido registrado ou em andamento.')
      pedido.current = null
      setSelecionados([])
      const atualizado = await consultarEasyMaestro(administradora)
      setPainel(atual => ({
        ativo: atualizado.ativo,
        receitas: [...atual.receitas.filter(r => r.administradora !== administradora), ...atualizado.receitas],
      }))
    } catch {
      setErro(pedido.current
        ? 'Não foi possível confirmar o pedido. Clique em Captar agora para tentar o mesmo pedido.'
        : 'Pedido processado. Recarregue a página para atualizar o painel.')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className="space-y-5">
      <section className={styles.panel}>
        <label htmlFor="easy-maestro-administradora" className="text-sm font-semibold">Qual administradora?</label>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <select id="easy-maestro-administradora" className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm" value={administradora} disabled={enviando}
            onChange={event => {
              setAdministradora(event.target.value)
              atualizarSelecao([])
            }}>
            <option value="">Selecione a administradora</option>
            {[...administradoras].map(([id, nome]) => <option key={id} value={id}>{nome}</option>)}
          </select>
          <button type="button" className={styles.primary} disabled={disponiveis === 0 || !selecaoDisponivel.length} onClick={captar}>
            <Play size={16} aria-hidden="true" /> {enviando ? 'Registrando pedido…' : 'Captar agora'}
          </button>
        </div>
        <label className="mt-4 flex items-start gap-2 text-sm">
          <input type="checkbox" className="mt-0.5 h-4 w-4 accent-cyan-700" checked={montarFlow}
            disabled={!podeCaptar || enviando || loteEmAndamento}
            onChange={event => {
              pedido.current = null
              setMontarFlow(event.target.checked)
            }} />
          <span>
            <span className="block font-semibold">Montar flow após a captação</span>
            <span className="text-xs text-slate-600">Deixa o flow pronto para revisão e liberação em Flows.</span>
          </span>
        </label>
        <p className="mt-3 text-sm text-slate-600">A captação fica disponível quando a cota do ciclo completa o prazo da régua do condomínio.</p>
        <div aria-live="polite">
          {administradora && (
            <p className={`mt-3 inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium ${disponiveis ? 'bg-emerald-50 text-emerald-900' : 'bg-slate-100 text-slate-700'}`}>
              <strong className="text-lg font-bold tabular-nums">{disponiveis}</strong>
              {disponiveis === 1 ? 'condomínio disponível para captar agora' : 'condomínios disponíveis para captar agora'}
            </p>
          )}
          {disponiveis > 0 && (
            <p className="mt-2 text-sm text-slate-600">
              {selecaoDisponivel.length ? `${selecaoDisponivel.length} de ${disponiveis} selecionados.` : 'Marque na lista os condomínios que deseja captar.'}
            </p>
          )}
          {motivoBloqueio && (administradora || !painel.ativo) && (
            <p className="mt-2 text-sm font-semibold text-amber-800">
              {motivoBloqueio}
            </p>
          )}
        </div>
        {!inicial.receitas.length && <p className="mt-2 text-sm text-slate-600">Nenhuma captação automática está disponível nas suas carteiras.</p>}
        {mensagem && <p role="status" className="mt-3 text-sm font-semibold text-cyan-900">{mensagem}</p>}
        {erro && <p role="alert" className="mt-3 text-sm font-semibold text-rose-800">{erro}</p>}
      </section>
      {administradora && (
        <section className={styles.panel}>
          <h2 className="text-lg font-semibold">Captações da administradora</h2>
          <p className="mt-1 text-sm text-slate-600">{primeiraReceita.size} condomínio(s) · {receitas.length} coleta(s){atualizando ? ' · Atualização automática' : ''}</p>
          {disponiveis > 0 && (
            <label className="mt-3 inline-flex cursor-pointer items-center gap-2 text-sm font-semibold">
              <input type="checkbox" className="h-4 w-4 accent-cyan-700" checked={selecaoDisponivel.length === disponiveis}
                onChange={event => atualizarSelecao(event.target.checked ? [...emPrazo] : [])} />
              Selecionar todos os disponíveis
            </label>
          )}
          <ul className="mt-3 divide-y divide-slate-100">
            {receitas.map(receita => {
              const consolidado = receita.consolidado
              const dataExibida = consolidado && !emAndamento(receita) ? consolidado.captadoEm : receita.solicitadaEm
              return (
                <li key={receita.id} className={`flex flex-wrap items-start justify-between gap-2 rounded-xl px-3 py-3 text-sm ${receita.ultimaCaptacaoNoMes ? 'bg-emerald-50' : ''}`}>
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      {primeiraReceita.get(receita.condominioId) === receita.id ? (
                        <label className="inline-flex items-center gap-2 font-semibold">
                          <input type="checkbox" className="h-4 w-4 accent-cyan-700"
                            disabled={disponiveis === 0 || !emPrazo.has(receita.condominioId)}
                            checked={selecaoDisponivel.includes(receita.condominioId)}
                            onChange={event => atualizarSelecao(event.target.checked
                              ? [...selecaoDisponivel, receita.condominioId]
                              : selecaoDisponivel.filter(id => id !== receita.condominioId))} />
                          {receita.condominio}
                        </label>
                      ) : <p className="font-semibold">{receita.condominio}</p>}
                      {receita.ultimaCaptacaoNoMes && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-900">
                          <Check size={13} aria-hidden="true" />
                          {consolidado ? 'Captado no consolidado' : 'Captado no mês'} · {new Date(consolidado?.captadoEm ?? receita.ultimaCaptacaoNoMes).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-600">{receita.nome}</p>
                    {!receita.liberada && !emAndamento(receita) && (
                      <p className="mt-1 text-xs font-medium text-amber-800">
                        {receita.liberacaoEm ? `Libera em ${formatarVencimentoAcordo(receita.liberacaoEm)}` : 'Cadastre o dia de vencimento da cota para liberar.'}
                      </p>
                    )}
                    {receita.detalhe && <p className="mt-1 text-xs text-slate-600">{consolidado && receita.estado === 'revisar' ? 'Tentativa avulsa: ' : ''}{receita.detalhe}</p>}
                    {montandoFlow(receita) && <p className="mt-1 text-xs text-slate-600">Montando flow para revisão.</p>}
                    {receita.montagemStatus === 'atencao' && <p className="mt-1 text-xs text-amber-800">A montagem precisa de revisão no Maestro.</p>}
                    {receita.montagemStatus === 'concluido' && (
                      receita.flowsMontados
                        ? <Link className="mt-1 block text-xs font-semibold text-cyan-800 underline" href={`/app/flows/cobranca/email?aba=flows&condominio=${encodeURIComponent(receita.condominioId)}`}>Revisar flows montados ({receita.flowsMontados})</Link>
                        : <p className="mt-1 text-xs text-slate-600">Nenhuma cobrança elegível para um novo flow.</p>
                    )}
                    {consolidado ? (
                      <Link className="mt-1 inline-block text-xs font-semibold text-cyan-800 underline" href={`/app/configuracoes/lab/captacao-automatizada/${consolidado.conversaoId}`}>Ver validação do consolidado</Link>
                    ) : receita.conversaoId && <Link className="mt-1 inline-block text-xs font-semibold text-cyan-800 underline" href={`/app/configuracoes/lab/captacao-automatizada/${receita.conversaoId}`}>Ver validação</Link>}
                  </div>
                  <div className="text-right">
                    <p className="font-semibold text-slate-800">{consolidado && !emAndamento(receita)
                      ? 'Importado no consolidado'
                      : <>{receita.estado === 'disponivel' && !receita.liberada ? 'Aguardando régua' : estados[receita.estado]}{receita.estado === 'importado' && receita.cobrancas !== null ? ` · ${receita.cobrancas} cobrança(s)` : ''}</>}</p>
                    {dataExibida && <p className="text-xs text-slate-500">{new Date(dataExibida).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}</p>}
                  </div>
                </li>
              )
            })}
          </ul>
        </section>
      )}
    </div>
  )
}
