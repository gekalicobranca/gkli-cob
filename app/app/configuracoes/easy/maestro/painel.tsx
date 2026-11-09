'use client'

import Link from 'next/link'
import { Play } from 'lucide-react'
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

export function EasyMaestro({ inicial, podeCaptar }: { inicial: PainelEasyMaestro; podeCaptar: boolean }) {
  const [painel, setPainel] = useState(inicial)
  const [administradora, setAdministradora] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [mensagem, setMensagem] = useState('')
  const [erro, setErro] = useState('')
  const pedido = useRef<string | null>(null)
  const administradoras = new Map(inicial.receitas.map(r => [r.administradora, r.administradoraNome]))
  const receitas = painel.receitas.filter(r => r.administradora === administradora)
  const condominios = new Set(receitas.map(r => r.condominioId)).size
  const disponivelParaCaptar = receitas.some(r => r.liberada && !emAndamento(r))
  const atualizando = receitas.some(emAndamento)
  const loteEmAndamento = receitas.some(r => r.easy && emAndamento(r))

  useEffect(() => {
    if (!administradora || !atualizando || enviando) return
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
        if (!cancelado) timer = setTimeout(atualizar, 8000)
      }
    }
    timer = setTimeout(atualizar, 8000)
    return () => { cancelado = true; clearTimeout(timer) }
  }, [administradora, atualizando, enviando])

  async function captar() {
    if (enviando || !administradora) return
    setEnviando(true)
    setErro('')
    setMensagem('')
    pedido.current ??= crypto.randomUUID()
    try {
      const resultado = await captarEasyMaestro(administradora, pedido.current)
      if (resultado.error) {
        setErro(resultado.error)
        return
      }
      setMensagem(resultado.criadas
        ? `${resultado.criadas} pedido(s) registrado(s) na fila do Maestro.`
        : 'As captações selecionadas já têm pedido registrado ou em andamento.')
      const atualizado = await consultarEasyMaestro(administradora)
      setPainel(atual => ({
        ativo: atualizado.ativo,
        receitas: [...atual.receitas.filter(r => r.administradora !== administradora), ...atualizado.receitas],
      }))
      pedido.current = null
    } catch {
      setErro('Não foi possível atualizar o painel. Clique em Captar agora para consultar o mesmo pedido.')
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
              setMensagem('')
              setErro('')
              pedido.current = null
            }}>
            <option value="">Selecione a administradora</option>
            {[...administradoras].map(([id, nome]) => <option key={id} value={id}>{nome}</option>)}
          </select>
          <button type="button" className={styles.primary} disabled={!podeCaptar || !painel.ativo || !disponivelParaCaptar || enviando || loteEmAndamento} onClick={captar}>
            <Play size={16} aria-hidden="true" /> {enviando ? 'Registrando pedido…' : 'Captar agora'}
          </button>
        </div>
        <p className="mt-3 text-sm text-slate-600">A captação fica disponível quando a cota do ciclo completa o prazo da régua do condomínio.</p>
        {!inicial.receitas.length && <p className="mt-2 text-sm text-slate-600">Nenhuma captação automática está disponível nas suas carteiras.</p>}
        {!painel.ativo && <p className="mt-2 text-sm font-semibold text-amber-800">A captação está desligada no Maestro.</p>}
        {mensagem && <p role="status" className="mt-3 text-sm font-semibold text-cyan-900">{mensagem}</p>}
        {erro && <p role="alert" className="mt-3 text-sm font-semibold text-rose-800">{erro}</p>}
      </section>
      {administradora && (
        <section className={styles.panel}>
          <h2 className="text-lg font-semibold">Captações da administradora</h2>
          <p className="mt-1 text-sm text-slate-600">{condominios} condomínio(s) · {receitas.length} coleta(s){atualizando ? ' · Atualização automática' : ''}</p>
          <ul className="mt-3 divide-y divide-slate-100">
            {receitas.map(receita => (
              <li key={receita.id} className="flex flex-wrap items-start justify-between gap-2 py-3 text-sm">
                <div>
                  <p className="font-semibold">{receita.condominio}</p>
                  <p className="text-xs text-slate-600">{receita.nome}</p>
                  {!receita.liberada && !emAndamento(receita) && (
                    <p className="mt-1 text-xs font-medium text-amber-800">
                      {receita.liberacaoEm ? `Libera em ${formatarVencimentoAcordo(receita.liberacaoEm)}` : 'Cadastre o dia de vencimento da cota para liberar.'}
                    </p>
                  )}
                  {receita.detalhe && <p className="mt-1 text-xs text-slate-600">{receita.detalhe}</p>}
                  {receita.conversaoId && <Link className="mt-1 inline-block text-xs font-semibold text-cyan-800 underline" href={`/app/configuracoes/lab/captacao-automatizada/${receita.conversaoId}`}>Ver validação</Link>}
                </div>
                <div className="text-right">
                  <p className="font-semibold text-slate-800">{receita.estado === 'disponivel' && !receita.liberada ? 'Aguardando régua' : estados[receita.estado]}{receita.estado === 'importado' && receita.cobrancas !== null ? ` · ${receita.cobrancas} cobrança(s)` : ''}</p>
                  {receita.solicitadaEm && <p className="text-xs text-slate-500">{new Date(receita.solicitadaEm).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}</p>}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
