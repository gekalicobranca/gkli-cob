'use client'

import { useEffect, useState, useTransition } from 'react'
import styles from '@/components/easy/easy.module.css'
import type { ParcelaEasyPague } from '@/features/easy-cob/pague-server'
import { consultarEasyPague, solicitarEasyPague } from './actions'
import {estadoConsultaPague} from '@/features/easy-cob/pague-model'
import Link from 'next/link'
import {EasyWorkerHealth} from '@/components/easy/worker-health'

type Props = {
  dataLimite: string
  administradoras: { id: string; nome: string }[]
  podeConsultar: boolean
}

const moeda = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
const dataBr = (data: string) => data.split('-').reverse().join('/')
const acaoSecundaria = 'inline-flex items-center rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-50'

function estadoParcela(parcela: ParcelaEasyPague) {
  return estadoConsultaPague(parcela)
}

export function EasyPague({ dataLimite, administradoras, podeConsultar }: Props) {
  const [administradora, setAdministradora] = useState('')
  const [painel, setPainel] = useState<Awaited<ReturnType<typeof consultarEasyPague>> | null>(null)
  const [mensagem, setMensagem] = useState('')
  const [erroLeitura, setErroLeitura] = useState(false)
  const [carregando, setCarregando] = useState(false)
  const [revisao, setRevisao] = useState(0)
  const [limite, setLimite] = useState(30)
  const [enviando, iniciar] = useTransition()
  const parcelas = painel?.parcelas ?? []
  const confirmadas = parcelas.filter(p => p.resultado?.estado === 'confirmado').length
  const emAndamento = parcelas.some(p => p.estado === 'fila' || p.estado === 'consultando')
  const podeIniciar = podeConsultar && parcelas.some(p => p.configuracao_id && !p.estado)

  useEffect(() => {
    if (!administradora) return
    let vigente = true
    let timer: ReturnType<typeof setTimeout>
    async function atualizar() {
      try {
        const dados = await consultarEasyPague(administradora)
        if (!vigente) return
        setPainel(dados)
        setErroLeitura(false)
        if (dados.parcelas.some(p => p.estado === 'fila' || p.estado === 'consultando')) {
          timer = setTimeout(atualizar, 10_000)
        }
      } catch {
        if (vigente) setErroLeitura(true)
      } finally {
        if (vigente) setCarregando(false)
      }
    }
    void atualizar()
    return () => {
      vigente = false
      clearTimeout(timer)
    }
  }, [administradora, revisao])

  function relerPainel() {
    setCarregando(true)
    setErroLeitura(false)
    setRevisao(atual => atual + 1)
  }

  function consultar() {
    setMensagem('')
    iniciar(async () => {
      try {
        const resposta = await solicitarEasyPague(administradora)
        if (resposta.error) {
          setMensagem(resposta.error)
        } else {
          setMensagem(resposta.criadas ? 'Pedido registrado na fila.' : 'Nenhuma nova consulta disponível para esta data.')
        }
      } catch {
        setMensagem('A resposta do pedido foi interrompida. Confira o estado das parcelas antes de solicitar outra consulta.')
      } finally {
        relerPainel()
      }
    })
  }

  return (
    <>
      {painel&&<EasyWorkerHealth saude={painel.saude} erro={painel.saudeIndisponivel}/>}
      <section className={styles.panel}>
        <div className="flex flex-wrap items-end gap-4">
          <div className="w-full min-w-0 sm:flex-1">
            <label htmlFor="pague-administradora" className="mb-1 block font-medium">Qual administradora?</label>
            <select id="pague-administradora" className="w-full rounded-lg border border-slate-300 bg-white p-2.5" value={administradora} disabled={enviando} onChange={event => {
              setPainel(null)
              setMensagem('')
              setErroLeitura(false)
              setCarregando(Boolean(event.target.value))
              setLimite(30)
              setAdministradora(event.target.value)
            }}>
              <option value="">Selecione uma administradora</option>
              {administradoras.map(item => <option key={item.id} value={item.id}>{item.nome}</option>)}
            </select>
          </div>
          <p className="text-sm text-slate-600">Data de corte: <strong>{dataBr(painel?.dataLimite ?? dataLimite)}</strong></p>
        </div>
        {!administradoras.length && <p className="mt-4 text-sm">Nenhuma parcela vencida aguardando confirmação nas suas carteiras.</p>}
        {!!parcelas.length && (
          <div className="mt-4 flex flex-wrap gap-3">
            {podeIniciar && (
              <button type="button" className={styles.primary} onClick={consultar} disabled={enviando || carregando || erroLeitura}>{enviando ? 'Solicitando…' : 'Consultar baixas'}</button>
            )}
            {confirmadas < parcelas.length && (
              <a href={`/api/easy-pague/planilha?administradora=${encodeURIComponent(administradora)}`} className={podeIniciar || emAndamento ? acaoSecundaria : styles.primary}>Gerar planilha para e-mail</a>
            )}
          </div>
        )}
        <div role="status" className="mt-3 text-sm text-slate-600">
          {mensagem} {carregando ? 'Atualizando parcelas…' : emAndamento && !erroLeitura ? 'Consulta em andamento.' : ''}
        </div>
        {erroLeitura && <div className="mt-3 space-y-2">
          <p role="alert">{painel ? 'A atualização falhou. A lista mostra a última leitura.' : 'Não foi possível carregar as parcelas desta administradora.'}</p>
          <button type="button" className={acaoSecundaria} onClick={relerPainel}>Atualizar lista de parcelas</button>
        </div>}
      </section>
      {painel && (
        <section className={`${styles.panel} mt-5`}>
          <h2 className="font-semibold">Parcelas de acordo</h2>
          <p className="my-2 text-sm text-slate-600">{confirmadas} com confirmação na consulta · {parcelas.length - confirmadas} sem confirmação suficiente</p>
          <p role="note" className="my-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-950">O corte desta consulta é {dataBr(painel?.dataLimite??dataLimite)}, no fuso de São Paulo. A consulta não registra baixa nem altera parcelas. Sem confirmação não significa falta de pagamento: confira as evidências e faça a conciliação no acordo.</p>
          {!!parcelas.length && <div className="overflow-x-auto" role="region" aria-label="Parcelas de acordo" tabIndex={0}>
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 text-slate-600">
                <tr>{['Condomínio / unidade', 'Parcela', 'Vencimento', 'Valor', 'Confirmação'].map(titulo => <th key={titulo} scope="col" className="p-2">{titulo}</th>)}</tr>
              </thead>
              <tbody>
                {parcelas.slice(0, limite).map(parcela => (
                  <tr key={parcela.parcela_id} className="border-b border-slate-100">
                    <td className="p-2">{parcela.condominio}<div className="text-slate-600">{parcela.bloco ? `Bloco ${parcela.bloco} · ` : ''}Unidade {parcela.unidade}</div></td>
                    <td className="p-2">{parcela.numero}</td>
                    <td className="whitespace-nowrap p-2">{dataBr(parcela.vencimento)}</td>
                    <td className="whitespace-nowrap p-2">{moeda.format(parcela.valor)}</td>
                    <td className={`p-2 ${parcela.resultado?.estado === 'confirmado' ? 'font-medium text-emerald-700' : ''}`}>{estadoParcela(parcela)}<Link href={`/app/acordos/${parcela.acordo_id}`} className="mt-1 block text-xs text-cyan-800 underline">Conferir evidências e conciliação no acordo</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>}
          {parcelas.length > limite && <button type="button" className={`${acaoSecundaria} mt-4`} onClick={() => setLimite(atual => atual + 30)}>Mostrar mais parcelas</button>}
          {!parcelas.length && <p className="text-sm">Nenhuma parcela aguardando confirmação para esta administradora.</p>}
        </section>
      )}
    </>
  )
}
