'use client'

import { useRouter } from 'next/navigation'
import { useRef, useState, type FormEvent } from 'react'
import styles from '@/components/easy/easy.module.css'
import { excluirCobranca } from './actions'

export function ExclusaoCobranca({ id, consulta }: { id: string; consulta: string }) {
  const router = useRouter()
  const ocupado = useRef(false)
  const [pendente, setPendente] = useState(false)
  const [resultado, setResultado] = useState<Awaited<ReturnType<typeof excluirCobranca>>>()
  async function enviar(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (ocupado.current) return
    const form = new FormData(event.currentTarget)
    ocupado.current = true
    setPendente(true)
    setResultado(undefined)
    try {
      const resposta = await excluirCobranca(form)
      setResultado(resposta)
      if (resposta.estado === 'invalido') ocupado.current = false
      if (resposta.estado === 'excluida') {
        const destino = '/app/configuracoes/easy/cobrancas?resultado=excluida'
        if (resposta.atualizar) window.location.replace(destino)
        else router.replace(destino)
      }
    } catch {
      setResultado({ estado: 'conferir', mensagem: 'Resposta interrompida. Consulte a unidade para conferir se a cobrança continua na operação.' })
    } finally {
      setPendente(false)
    }
  }
  return <form onSubmit={enviar} className="mt-4 space-y-3">
    <fieldset disabled={pendente || resultado?.estado === 'conferir' || resultado?.estado === 'excluida'} className="grid min-w-0 gap-3">
      <input type="hidden" name="id" value={id}/>
      <label>Motivo da exclusão (mínimo de 10 caracteres)<textarea name="motivo" required minLength={10} className="block w-full rounded-lg border p-3"/></label>
      <label className="flex min-h-11 items-center gap-2"><input type="checkbox" name="confirmar" required/> Confirmo a retirada desta cobrança da operação.</label>
      <div className={styles.operationActions}><button className={styles.primary}>Excluir cobrança</button></div>
    </fieldset>
    {pendente && <p role="status">Registrando exclusão…</p>}
    {resultado?.estado === 'excluida' && <p role="status">Cobrança excluída da operação.</p>}
    {resultado && resultado.estado !== 'excluida' && <p role="alert">{resultado.mensagem}</p>}
    {resultado?.estado === 'conferir' && <a href={consulta} className="inline-flex min-h-11 items-center underline">Consultar cobranças da unidade</a>}
  </form>
}
