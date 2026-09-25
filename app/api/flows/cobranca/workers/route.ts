import { whatsappOperationStatus } from '@/features/mensageria/whatsapp-operation-status'
import { NextResponse } from 'next/server'
import { getPermittedCarteiras } from '@/utils/auth/get-permitted-carteiras'
import { applyCarteiraScope } from '@/utils/auth/apply-carteira-scope'
import { createAdminClient } from '@/utils/supabase/admin'
import { workerStatus, type WorkerStatus } from '@/features/mensageria/worker-status'

export async function GET(request: Request) {
  const scope = await getPermittedCarteiras()
  const canal = new URL(request.url).searchParams.get('canal')
  if (canal !== 'email' && canal !== 'whatsapp') return NextResponse.json({ error: 'Canal inválido' }, { status: 400 })
  try {
    const db = createAdminClient()
    const { data: carteiras, error } = await applyCarteiraScope(db.from('carteiras')
      .select('id,email_transporte,email_habilitado,whatsapp_habilitado,whatsapp_transporte,whatsapp_web_sessao,whatsapp_web_numero'), scope.carteiraIds, 'id')
    if (error) throw error
    const ids = (carteiras ?? []).map(c => c.id)
    if (!ids.length) return NextResponse.json({ statuses: {} }, { headers: { 'Cache-Control': 'no-store' } })
    const sessoes = (carteiras ?? []).map(c => c.whatsapp_web_sessao).filter(Boolean)
    const [workers, web, thunderbird, controls] = await Promise.all([
      db.from('agente_workers').select('script_key,ultimo_sinal_em,metadata_json').in('script_key', [`mensageria:${canal}`, ...sessoes.map(s => `mensageria:web:${s}`)]),
      canal === 'whatsapp' && sessoes.length ? db.from('whatsapp_web_sessoes').select('id,status,numero,atualizado_em').in('id', sessoes) : Promise.resolve({ data: [], error: null }),
      canal === 'email' ? db.from('thunderbird_dispositivos').select('carteira_id,automatico,testado_em,visto_em').in('carteira_id', ids).eq('ativo', true) : Promise.resolve({ data: [], error: null }),
      canal === 'whatsapp' && sessoes.length ? db.from('whatsapp_worker_controles').select('*').in('sessao', sessoes) : Promise.resolve({ data: [], error: null }),
    ])
    if (workers.error || web.error || thunderbird.error) throw new Error('Status indisponível')
    const statuses: Record<string, WorkerStatus> = {}
    for (const c of carteiras ?? []) {
      if ((canal === 'email' ? c.email_habilitado : c.whatsapp_habilitado) === false && !(canal === 'whatsapp' && c.whatsapp_transporte === 'web')) {
        statuses[c.id] = { cor: 'amarelo', texto: `${canal === 'email' ? 'E-mail' : 'WhatsApp'} desabilitado na carteira`, detalhe: 'O canal está desabilitado no cadastro da carteira.', proximoPasso: 'Um administrador deve revisar a permissão deste canal no cadastro da carteira.' }; continue
      }
      if (canal === 'email' && c.email_transporte === 'thunderbird') {
        const d = thunderbird.data?.find(d => d.carteira_id === c.id)
        statuses[c.id] = d && (!d.automatico || !d.testado_em)
          ? { cor: 'amarelo', texto: 'Thunderbird · fila desabilitada ou teste pendente' }
          : workerStatus(d?.visto_em, 'operando')
      } else if (canal === 'whatsapp' && c.whatsapp_transporte === 'web') {
        const s = web.data?.find(s => s.id === c.whatsapp_web_sessao)
        const w = workers.data?.find(w => w.script_key === `mensageria:web:${c.whatsapp_web_sessao}`)
        const state = whatsappOperationStatus({ session: s, monitor: w, control: controls.data?.find(row => row.sessao === c.whatsapp_web_sessao), expectedPhone: c.whatsapp_web_numero, channelEnabled: c.whatsapp_habilitado !== false })
        const connection = { conectado: 'conectado', iniciando: 'conectando', conferencia_necessaria: 'recuperação após envio sem confirmação', aguardando_qr: 'aguardando leitura do QR Code', falha_autenticacao: 'autenticação necessária', desconectado: 'desconectado', parado: 'parado', erro: 'falha de conexão', numero_incorreto: 'número incorreto' }[s?.status as string] ?? 'não confirmado'
        statuses[c.id] = {
          cor: state.tone === 'green' ? 'verde' : state.tone === 'red' ? 'vermelho' : 'amarelo', texto: state.title,
          detalhe: [state.detail, state.command, `Último estado informado pelo WhatsApp: ${connection}.`, controls.error ? 'Não foi possível consultar o controle da recuperação automática.' : `Recuperação automática: ${state.supervisorOnline ? 'ativa' : 'sem sinal recente'}.`].filter(Boolean).join(' '),
          proximoPasso: state.next, sinalEm: s?.atualizado_em,
        }

      } else {
        const w = workers.data?.find(w => w.script_key === `mensageria:${canal}`)
        statuses[c.id] = workerStatus(w?.ultimo_sinal_em, w?.metadata_json?.estado)
      }
    }
    return NextResponse.json({ statuses }, { headers: { 'Cache-Control': 'no-store' } })
  } catch {
    return NextResponse.json({ error: 'Não foi possível consultar os workers.' }, { status: 503, headers: { 'Cache-Control': 'no-store' } })
  }
}
