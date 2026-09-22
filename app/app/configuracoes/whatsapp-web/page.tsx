import Link from 'next/link'
import { PageHeader } from '@/components/ui/page-header'
import { Card } from '@/components/ui/card'
import { requireAdmin } from '@/utils/auth/require-admin'
import { createAdminClient } from '@/utils/supabase/admin'
import { configurarWhatsappWeb, conferirWhatsappWeb } from '@/features/mensageria/whatsapp-web-actions'

export const dynamic = 'force-dynamic'

export default async function WhatsappWebPage() {
  await requireAdmin()
  const db = createAdminClient()
  const [carteiras, sessoes, pendencias] = await Promise.all([
    db.from('carteiras').select('id,nome,whatsapp_transporte,whatsapp_web_sessao,whatsapp_web_numero').order('nome'),
    db.from('whatsapp_web_sessoes').select('*'),
    db.from('whatsapp_web_envios').select('token,mensagem_id,sessao,numero,estado,iniciado_em,erro,mensagem:mensagens(lote_id)').in('estado',['reservado','incerto']).order('iniciado_em'),
  ])
  if (carteiras.error || sessoes.error || pendencias.error) {
    return <Card><p>WhatsApp Web indisponível. Verifique a aplicação da migração 20260917120000_whatsapp_web_flows e a conexão com o banco.</p></Card>
  }
  const labels: Record<string,string> = { conectado:'Conectado', aguardando_qr:'Aguardando leitura do QR Code', numero_incorreto:'Número conectado incorreto', desconectado:'Desconectado', falha_autenticacao:'Falha de autenticação', conferencia_necessaria:'Conferência necessária', parado:'Parado', erro:'Erro no worker', iniciando:'Iniciando' }
  return <div className="space-y-5">
    <PageHeader eyebrow="Configurações" title="WhatsApp Web temporário" description="Envio automático dos Flows por sessão conectada, enquanto a API oficial aguarda liberação." />
    <Card>
      <p className="text-sm text-slate-700">Conecte o número pelo QR Code exibido no terminal do worker e vincule a sessão às carteiras abaixo. O computador do worker precisa permanecer ligado e conectado.</p>
      <p className="mt-2 text-sm text-slate-600">Somente Flows ativos com agenda vencida são processados. Limite inicial: 50 tentativas por dia por número, das 9h às 18h (Brasília), com intervalo mínimo de 60 segundos.</p>
      <p className="mt-2 text-sm text-slate-600">Ao salvar WhatsApp Web, mensagens agendadas elegíveis passam a ser processadas pelo worker conectado. Pausar o Flow impede novas reservas; um envio já iniciado pode terminar.</p>
    </Card>
    <div className="grid gap-4 lg:grid-cols-2">{(carteiras.data ?? []).map(c => {
      const session = sessoes.data?.find(s => s.id === c.whatsapp_web_sessao)
      const stale = !session || Date.now()-new Date(session.atualizado_em).getTime()>120000
      return <Card key={c.id}>
        <h2 className="font-semibold">{c.nome}</h2>
        <p className="mt-1 text-sm text-slate-500">{c.whatsapp_transporte==='web' ? (stale ? 'Worker sem conexão recente' : labels[session.status] ?? session.status) : 'API oficial selecionada'}</p>
        <form action={configurarWhatsappWeb} className="mt-4 grid gap-3">
          <input type="hidden" name="carteira_id" value={c.id} />
          <label className="text-sm">Canal de envio<select name="transporte" defaultValue={c.whatsapp_transporte} className="mt-1 w-full rounded-xl border p-2"><option value="cloud">API oficial (Meta)</option><option value="web">WhatsApp Web temporário</option></select></label>
          <label className="text-sm">Nome da sessão<input name="sessao" defaultValue={c.whatsapp_web_sessao ?? 'gekali'} pattern="[a-zA-Z0-9_-]{1,60}" className="mt-1 w-full rounded-xl border p-2" /></label>
          <label className="text-sm">Número conectado (com DDD)<input name="numero" defaultValue={c.whatsapp_web_numero ?? ''} placeholder="5511999999999" className="mt-1 w-full rounded-xl border p-2" /></label>
          <button className="rounded-xl bg-emerald-700 px-4 py-2 text-sm font-medium text-white">Salvar configuração</button>
        </form>
      </Card>
    })}</div>
    <Card>
      <h2 className="font-semibold">Reservas e envios que exigem conferência</h2>
      <p className="mt-1 text-sm text-slate-500">Uma reserva antiga ou um resultado incerto bloqueia o número para evitar duplicidade. Pare o worker e confira a conversa e os anexos antes de registrar o resultado. Se houve envio parcial, complete os anexos na conversa antes de confirmar tudo enviado.</p>
      <div className="mt-3 space-y-3">{pendencias.data?.length ? pendencias.data.map(e => {
        const msg = Array.isArray(e.mensagem) ? e.mensagem[0] : e.mensagem
        return <div key={e.token} className="rounded-xl border p-3 text-sm">
          <p>{e.sessao} · {e.numero} · {e.estado==='incerto' ? 'Resultado incerto' : 'Reserva em andamento'}</p>
          <p className="mt-1 break-all text-xs text-slate-500">Mensagem: {e.mensagem_id} · Reserva: {e.token}</p>
          {e.erro ? <p className="mt-1 text-rose-700">{e.erro}</p> : null}
          {msg?.lote_id ? <Link className="mt-2 inline-block text-emerald-700 underline" href={`/app/lotes/${msg.lote_id}`}>Conferir lote</Link> : null}
          <details className="mt-3"><summary className="cursor-pointer font-medium">Registrar conferência</summary>
            <form action={conferirWhatsappWeb} className="mt-3 grid gap-3">
              <input type="hidden" name="token" value={e.token} />
              <label><input type="checkbox" name="worker_parado" required /> Parei o worker e conferi a conversa no WhatsApp.</label>
              <select name="resultado" required defaultValue="" className="rounded-xl border p-2"><option value="" disabled>Selecione o resultado</option><option value="enviado">Texto e todos os anexos foram enviados</option><option value="nao_enviado">Nada foi enviado; liberar reenvio pelo Flow</option></select>
              <textarea name="observacao" required minLength={10} placeholder="Descreva a conferência realizada" className="rounded-xl border p-2" />
              <button className="rounded-xl border px-4 py-2">Registrar resultado conferido</button>
            </form>
          </details>
        </div>
      }) : <p className="text-sm text-slate-500">Nenhuma reserva pendente.</p>}</div>
    </Card>
  </div>
}
