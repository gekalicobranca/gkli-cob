export type PairingView = { status: 'idle' | 'waiting' | 'available' | 'expired' | 'connected' | 'offline' | 'paused'; message: string; mode?: 'qr' | 'codigo'; payload?: string; expiresAt?: string }
type Control = { habilitado: boolean; atualizado_em: string; reiniciar_id: string | null; aplicado_id: string | null; supervisor_em: string | null; vinculacao_pedido: string | null; vinculacao_modo: string | null; vinculacao_payload: string | null; vinculacao_expira_em: string | null }
export function pairingView(control: Control | null, session: { status: string; atualizado_em: string } | null, now = Date.now()): PairingView {
  const fresh = (date: string | null | undefined) => { const age = now - Date.parse(date || ''); return age >= -30000 && age < 120000 }
  if (fresh(session?.atualizado_em) && session?.status === 'conectado') return { status: 'connected', message: 'WhatsApp conectado. Não é necessário vincular novamente.' }
  if (!control?.habilitado) return { status: 'paused', message: 'Retome o worker para solicitar a vinculação.' }
  if (!fresh(control.supervisor_em)) return { status: 'offline', message: 'Computador sem comunicação recente. Ligue o notebook e verifique a internet.' }
  if (!control.vinculacao_pedido || control.vinculacao_pedido !== control.reiniciar_id) return { status: 'idle', message: 'Escolha QR Code ou código de vinculação.' }
  const mode = control.vinculacao_modo === 'codigo' ? 'codigo' : 'qr'
  const preparing = control.aplicado_id !== control.vinculacao_pedido || !fresh(session?.atualizado_em) || session?.status !== 'aguardando_qr'
  if ((preparing || !control.vinculacao_payload) && now - Date.parse(control.atualizado_em) > 240000) return { status: 'expired', mode, message: 'A geração demorou mais que o esperado. Você pode tentar novamente.' }
  if (preparing) return { status: 'waiting', mode, message: 'Aguardando o notebook preparar a vinculação…' }
  if (!control.vinculacao_payload) return { status: 'waiting', mode, message: 'Aguardando o WhatsApp gerar o QR Code ou código…' }
  if (!control.vinculacao_expira_em || Date.parse(control.vinculacao_expira_em) <= now || !Number.isFinite(Date.parse(control.vinculacao_expira_em))) return { status: 'expired', mode, message: 'Código expirado. Gere uma nova vinculação.' }
  const valid = mode === 'codigo' ? /^[A-Z0-9]{8}$/.test(control.vinculacao_payload) : /^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(control.vinculacao_payload)
  if (!valid) return { status: 'waiting', mode, message: 'Aguardando um código válido do WhatsApp…' }
  return { status: 'available', mode, message: mode === 'qr' ? 'Leia este QR Code com o WhatsApp do celular da linha.' : 'No WhatsApp do celular, escolha conectar com número de telefone e digite este código.', payload: control.vinculacao_payload, expiresAt: control.vinculacao_expira_em }
}
