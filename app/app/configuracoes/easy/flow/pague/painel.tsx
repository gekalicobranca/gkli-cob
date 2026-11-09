'use client'

import { useEffect, useState, useTransition } from 'react'
import styles from '@/components/easy/easy.module.css'
import type { ParcelaEasyPague } from '@/features/easy-cob/pague-server'
import { consultarEasyPague, solicitarEasyPague } from './actions'

type Props = {
  dataLimite: string
  administradoras: { id: string; nome: string }[]
  podeConsultar: boolean
}

const moeda = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
const dataBr = (data: string) => data.split('-').reverse().join('/')
const acaoSecundaria = 'inline-flex items-center rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-50'

function estadoParcela(parcela: ParcelaEasyPague) {
  if (parcela.resultado?.estado === 'confirmado' && parcela.resultado.data_pagamento) {
    return `Confirmado em ${dataBr(parcela.resultado.data_pagamento)}`
  }
  if (parcela.estado === 'fila' || parcela.estado === 'consultando') return 'Consulta em andamento'
  if (parcela.resultado?.detalhe) return parcela.resultado.detalhe
  if (parcela.estado === 'falha') return 'Consulta indisponível. Peça a confirmação por e-mail.'
  return parcela.configuracao_id ? 'Aguardando consulta' : 'Confirmação por e-mail'
}

export function EasyPague({ dataLimite, administradoras, podeConsultar }: Props) {
  const [administradora, setAdministradora] = useState('')
  const [painel, setPainel] = useState<Awaited<ReturnType<typeof consultarEasyPague>> | null>(null)
  const [mensagem, setMensagem] = useState('')
  const [limite, setLimite] = useState(30)
  const [enviando, iniciar] = useTransition()
  const parcelas = painel?.parcelas ?? []
  const confirmadas = parcelas.filter(p => p.resultado?.estado === 'confirmado').length
  const emAndamento = parcelas.some(p => p.estado === 'fila' || p.estado === 'consultando')
  const podeIniciar = podeConsultar && parcelas.some(p => p.configuracao_id && !p.estado)

  useEffect(() => {
    if (!administradora) return
    let vigente = true
    function atualizar() {
      consultarEasyPague(administradora).then(
        dados => { if (vigente) setPainel(dados) },
        () => { if (vigente) setMensagem('Não foi possível carregar as parcelas. Selecione a administradora novamente.') },
      )
    }
    if (!painel) atualizar()
    const timer = emAndamento ? window.setInterval(atualizar, 10_000) : undefined
    return () => {
      vigente = false
      window.clearInterval(timer)
    }
  }, [administradora, emAndamento, painel])

  function consultar() {
    setMensagem('')
    iniciar(async () => {
      try {
        const resposta = await solicitarEasyPague(administradora)
        if (resposta.error) {
          setMensagem(resposta.error)
          return
        }
        setMensagem(resposta.criadas ? 'Consulta solicitada. Os resultados serão atualizados aqui.' : 'Nenhuma nova consulta disponível para esta data.')
        setPainel(await consultarEasyPague(administradora))
      } catch {
        setMensagem('Não foi possível atualizar a consulta. Tente novamente.')
      }
    })
  }

  return (
    <>
      <section className={styles.panel}>
        <div className="flex flex-wrap items-end gap-4">
          <div className="min-w-60 flex-1">
            <label htmlFor="pague-administradora" className="mb-1 block font-medium">Qual administradora?</label>
            <select id="pague-administradora" className="w-full rounded-lg border border-slate-300 bg-white p-2.5" value={administradora} disabled={enviando} onChange={event => {
              setPainel(null)
              setMensagem('')
              setLimite(30)
              setAdministradora(event.target.value)
            }}>
              <option value="">Selecione uma administradora</option>
              {administradoras.map(item => <option key={item.id} value={item.id}>{item.nome}</option>)}
            </select>
          </div>
          <p className="text-sm text-slate-600">Baixas até <strong>{dataBr(painel?.dataLimite ?? dataLimite)}</strong></p>
        </div>
        {!administradoras.length && <p className="mt-4 text-sm">Nenhuma parcela vencida aguardando confirmação nas suas carteiras.</p>}
        {!!parcelas.length && (
          <div className="mt-4 flex flex-wrap gap-3">
            {podeIniciar && (
              <button type="button" className={styles.primary} onClick={consultar} disabled={enviando}>{enviando ? 'Solicitando…' : 'Consultar baixas'}</button>
            )}
            {confirmadas < parcelas.length && (
              <a href={`/api/easy-pague/planilha?administradora=${encodeURIComponent(administradora)}`} className={podeIniciar || emAndamento ? acaoSecundaria : styles.primary}>Gerar planilha para e-mail</a>
            )}
          </div>
        )}
        <div aria-live="polite" className="mt-3 text-sm text-slate-600">
          {mensagem || (emAndamento ? 'Consulta em andamento.' : administradora && !painel ? 'Carregando parcelas…' : '')}
        </div>
      </section>
      {painel && (
        <section className={`${styles.panel} mt-5`}>
          <h2 className="font-semibold">Parcelas de acordo</h2>
          <p className="my-2 text-sm text-slate-600">{confirmadas} confirmadas · {parcelas.length - confirmadas} a confirmar</p>
          {!!parcelas.length && <div className="overflow-x-auto">
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
                    <td className={`p-2 ${parcela.resultado?.estado === 'confirmado' ? 'font-medium text-emerald-700' : ''}`}>{estadoParcela(parcela)}</td>
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
