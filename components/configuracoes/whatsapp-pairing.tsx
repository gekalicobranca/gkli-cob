'use client'
import { useEffect, useRef, useState } from 'react'
import { consultarVinculacaoWhatsapp, solicitarVinculacaoWhatsapp } from '@/features/mensageria/whatsapp-pairing-actions'
import type { PairingView } from '@/features/mensageria/whatsapp-pairing-state'

export function WhatsappPairing({ session }: { session: string }) {
  const [open, setOpen] = useState(false)
  const [view, setView] = useState<PairingView | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [now, setNow] = useState(0)
  const requestVersion = useRef(0)
  useEffect(() => {
    if (!open) return
    let cancelled = false
    let timer: ReturnType<typeof setTimeout>
    async function poll() {
      const version = requestVersion.current
      try {
        const result = await consultarVinculacaoWhatsapp(session)
        if (!cancelled && version === requestVersion.current) { setView(result); setError(''); setNow(Date.now()) }
      } catch { if (!cancelled && version === requestVersion.current) { setView(null); setError('Não foi possível consultar a conexão. Tentando novamente…') } }
      finally { if (!cancelled) timer = setTimeout(poll, 5000) }
    }
    void poll()
    const clock = setInterval(() => setNow(Date.now()), 1000)
    return () => { cancelled = true; clearTimeout(timer); clearInterval(clock) }
  }, [open, session])
  async function request(mode: 'qr' | 'codigo') {
    requestVersion.current++
    setBusy(true); setError(''); setView(null)
    try { setView(await solicitarVinculacaoWhatsapp(session, mode)); setNow(Date.now()) }
    catch { setError('Não foi possível gerar a vinculação. Verifique se o worker está ativo e sem envio em andamento.') }
    finally { requestVersion.current++; setBusy(false) }
  }
  const seconds = view?.expiresAt ? Math.max(0, Math.ceil((Date.parse(view.expiresAt) - now) / 1000)) : 0
  const available = view?.status === 'available' && seconds > 0 && !busy
  const disabled = busy || !view || ['connected', 'offline', 'paused', 'waiting'].includes(view.status)
  return <details className="border-t border-slate-100 px-5 py-4" onToggle={event => setOpen(event.currentTarget.open)}>
    <summary className="cursor-pointer text-sm font-semibold text-emerald-800">Vincular WhatsApp neste app</summary>
    {open ? <div className="mt-4 space-y-3">
      <p className="text-sm text-slate-600">O notebook precisa estar ligado e conectado. QR Code e código exigem confirmação no celular da linha.</p>
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={disabled} onClick={() => void request('qr')} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium disabled:opacity-50">Gerar QR Code</button>
        <button type="button" disabled={disabled} onClick={() => void request('codigo')} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium disabled:opacity-50">Gerar código de vinculação</button>
      </div>
      <p role="status" className="text-sm text-slate-700">{error || (busy ? 'Solicitando vinculação…' : view?.status === 'available' && !available ? 'Código expirado. Gere novamente.' : view?.message || 'Consultando conexão…')}</p>
      {available ? <div className="w-fit max-w-full rounded-xl border border-slate-200 bg-white p-4">
        {view.mode === 'qr' ? <img src={view.payload} alt="QR Code de vinculação do WhatsApp" width={280} height={280} className="h-auto max-w-full" /> : <p className="break-all font-mono text-3xl font-bold tracking-widest text-slate-950">{view.payload?.replace(/^(.{4})(.{4})$/, '$1-$2')}</p>}
        <p className="mt-2 text-xs text-slate-500">Válido por mais {seconds}s. Não compartilhe com terceiros.</p>
      </div> : null}
      <p className="text-xs text-slate-500">No celular: WhatsApp → Dispositivos conectados → Conectar dispositivo. Para usar o código, escolha conectar com número de telefone.</p>
    </div> : null}
  </details>
}
