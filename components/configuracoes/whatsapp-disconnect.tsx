'use client'
import { useActionState } from 'react'
import { desconectarWhatsapp } from '@/features/mensageria/whatsapp-web-actions'

export function WhatsappDisconnect({ session }: { session: string }) {
  const [state, action, pending] = useActionState(desconectarWhatsapp, {})
  return <form action={action} onSubmit={event => {
    if (!window.confirm('Limpar o vínculo desta linha no servidor? Será necessário conectar novamente. Mensagens e histórico serão preservados.')) event.preventDefault()
  }} className="space-y-2">
    <input type="hidden" name="sessao" value={session} />
    <button disabled={pending} className="rounded-lg border border-rose-200 px-3 py-2 text-sm text-rose-800 disabled:opacity-50">{pending ? 'Solicitando…' : 'Desconectar e limpar vínculo'}</button>
    {state.error ? <p role="alert" className="text-sm text-rose-700">{state.error}</p> : null}
    {state.requested ? <p role="status" className="text-sm text-slate-600">Pedido registrado. Aguarde o serviço confirmar a desconexão.</p> : null}
  </form>
}
