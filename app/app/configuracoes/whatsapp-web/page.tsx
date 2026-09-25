import Link from 'next/link'
import { whatsappOperationStatus } from '@/features/mensageria/whatsapp-operation-status'
import { PageHeader } from '@/components/ui/page-header'
import { Card } from '@/components/ui/card'
import { requireAdmin } from '@/utils/auth/require-admin'
import { createAdminClient } from '@/utils/supabase/admin'
import { configurarWhatsappWeb, conferirWhatsappWeb, controlarWhatsappWorker, reenviarWhatsappIncerto } from '@/features/mensageria/whatsapp-web-actions'
import { WorkerAutoRefresh } from '@/components/configuracoes/worker-auto-refresh'
import { MetricCard } from '@/components/data/metric-card'
import { loadWhatsappDailySummary } from '@/features/mensageria/whatsapp-daily-query'

export const dynamic = 'force-dynamic'

export default async function WhatsappWebPage() {
  await requireAdmin()
  const db = createAdminClient()
  const consultedAt = new Date()
  const [carteiras, sessoes, pendencias, controles, monitores, daily] = await Promise.all([
    db.from('carteiras').select('id,nome,whatsapp_habilitado,whatsapp_transporte,whatsapp_web_sessao,whatsapp_web_numero').order('nome'),
    db.from('whatsapp_web_sessoes').select('*'),
    db.from('whatsapp_web_envios').select('token,mensagem_id,sessao,numero,estado,iniciado_em,erro,mensagem:mensagens(lote_id)').in('estado',['reservado','incerto']).order('iniciado_em'),
    db.from('whatsapp_worker_controles').select('*'),
    db.from('agente_workers').select('script_key,ultimo_sinal_em,metadata_json').like('script_key', 'mensageria:web:%'),
    loadWhatsappDailySummary(consultedAt).catch(error => { console.error('Resumo diário WhatsApp indisponível:', error); return null }),
  ])
  if (carteiras.error || sessoes.error || pendencias.error) {
    return <Card><p>WhatsApp Web indisponível. Verifique a aplicação da migração 20260917120000_whatsapp_web_flows e a conexão com o banco.</p></Card>
  }
  const labels: Record<string,string> = { conectado:'Conectado', aguardando_qr:'Aguardando QR Code', numero_incorreto:'Número incorreto', desconectado:'Desconectado', falha_autenticacao:'Autenticação necessária', conferencia_necessaria:'Reconectando após envio incerto', parado:'Desconectado', erro:'Falha de conexão', iniciando:'Conectando…' }
  const formatPhone = (value: string | null) => value?.replace(/^55(\d{2})(\d{4,5})(\d{4})$/, '+55 ($1) $2-$3') || 'Número não configurado'
  const formatSignal = (value: string | null) => value && Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }) : 'Sem sinal registrado'
  return <div className="space-y-5">
    <PageHeader eyebrow="Configurações" title="Conexões do WhatsApp" description="Confira a conexão de cada carteira e acompanhe a recuperação dos envios." />
    <WorkerAutoRefresh updatedAt={consultedAt.toISOString()} />
    <section aria-label="Envios de WhatsApp Web do dia" className="space-y-3">
      <h2 className="text-sm font-semibold text-slate-700">WhatsApp Web · hoje, {consultedAt.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })} · Brasília</h2>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Enviadas hoje" value={daily?.total.sent ?? '—'} hint="Mensagens com envio confirmado" />
        <MetricCard label="Aguardando envio" value={daily?.total.queued ?? '—'} hint="Agendadas até hoje, incluindo atrasadas" />
        <MetricCard label="Falhas hoje" value={daily?.total.failed ?? '—'} hint="Falhas efetivas; exclui agendas recuperadas" />
        <MetricCard label="Sem confirmação hoje" value={daily?.total.uncertain ?? '—'} hint="Resultados incertos para conferência" />
      </div>
      {!daily ? <p role="alert" className="text-sm text-amber-800">Não foi possível consultar os totais. Tente atualizar novamente.</p> : null}
    </section>
    {controles.error ? <Card><p className="text-amber-800">Os controles do supervisor ainda não estão disponíveis. Aplique a atualização do banco e inicie o supervisor no computador dos workers.</p></Card> : null}
    <Card className="p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-700">Verde: pronto para enviar. Amarelo: aguardando conexão ou ação. Vermelho: indisponível ou sem resposta. Cinza: pausado ou outro canal.</p>
        <a href="http://127.0.0.1:3877" target="_blank" rel="noreferrer" className="shrink-0 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-emerald-800">Abrir QR Code ou código de vinculação</a>
      </div>
      <details className="mt-3 border-t border-slate-100 pt-3"><summary className="cursor-pointer text-sm text-slate-500">Como funcionam os envios e a recuperação</summary>
      <p className="mt-2 text-sm text-slate-600">O computador dos workers precisa permanecer ligado e conectado. Uma sessão em conexão ainda não está pronta para enviar.</p>
      <p className="mt-2 text-sm text-slate-600">Somente Flows ativos com agenda vencida são processados. Limite diário: 50 por número, das 9h às 18h (Brasília), com intervalo mínimo de 60 segundos. Envios confirmados, em andamento, parciais e incertos ocupam a cota; falhas antes da transmissão não.</p>
      <p className="mt-2 text-sm text-slate-600">Ao salvar WhatsApp Web, mensagens agendadas elegíveis passam a ser processadas pelo worker conectado. Pausar o Flow impede novas reservas; um envio já iniciado pode terminar.</p>
      <p className="mt-2 text-sm text-slate-600">O supervisor recupera falhas de conexão com novas tentativas após 15, 30 e até 60 segundos. Mensagens sem confirmação ficam pendentes individualmente; as demais continuam. Uma autenticação expirada ainda exige leitura do QR Code.</p>
      </details>
    </Card>
    <div className="space-y-4">{(carteiras.data ?? []).map(c => {
      const session = sessoes.data?.find(s => s.id === c.whatsapp_web_sessao)
      const signalAge = session ? Date.now()-Date.parse(session.atualizado_em) : Infinity
      const stale = !Number.isFinite(signalAge) || signalAge < -30000 || signalAge >= 120000
      const control = controles.data?.find(row => row.sessao === c.whatsapp_web_sessao)
      const pendentes = pendencias.data?.filter(row => row.sessao === c.whatsapp_web_sessao && row.estado === 'incerto').length ?? 0
      const web = c.whatsapp_transporte === 'web'
      const state = whatsappOperationStatus({ session, control, channelEnabled: c.whatsapp_habilitado !== false, expectedPhone: c.whatsapp_web_numero, monitor: monitores.data?.find(row => row.script_key === `mensageria:web:${c.whatsapp_web_sessao}`) })
      const statusText = web ? state.title : 'API oficial · conexão não monitorada aqui'
      const tones = { green: 'border-emerald-200 bg-emerald-50 text-emerald-800', amber: 'border-amber-200 bg-amber-50 text-amber-900', red: 'border-rose-200 bg-rose-50 text-rose-800', gray: 'border-slate-200 bg-slate-50 text-slate-600' }
      const tone = tones[web ? state.tone : 'gray']
      return <Card key={c.id} className="overflow-hidden p-0">
        <div className="flex flex-col gap-4 px-5 py-5 xl:flex-row xl:items-center xl:justify-between">
          <div className="min-w-0 space-y-2">
            <h2 className="text-lg font-semibold text-slate-950">{c.nome}</h2>
            <div className="flex flex-wrap items-center gap-3">
              <span role="status" className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold ${tone}`}><span aria-hidden="true" className="h-2.5 w-2.5 shrink-0 rounded-full bg-current" />{statusText}</span>
              {web ? <span className="text-sm text-slate-600">{formatPhone(c.whatsapp_web_numero)}</span> : null}
            </div>
            {web ? <p className="text-xs text-slate-500">Último sinal: {formatSignal(session?.atualizado_em ?? null)} · horário de Brasília</p> : <p className="text-xs text-slate-500">Esta carteira usa a integração da Meta.</p>}
          </div>
        {web && c.whatsapp_web_sessao ? <div className="space-y-2 xl:shrink-0">
          <form action={controlarWhatsappWorker} className="flex flex-wrap gap-2">
            <input type="hidden" name="sessao" value={c.whatsapp_web_sessao} />
            <button disabled={Boolean(controles.error)} name="acao" value="reiniciar" className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">Reconectar WhatsApp</button>
            {control?.habilitado === false ? <button disabled={Boolean(controles.error)} name="acao" value="iniciar" className="rounded-lg border px-3 py-2 text-sm">Retomar envios</button> : null}
            <button disabled={Boolean(controles.error)} name="acao" value="pausar" className="rounded-lg border px-3 py-2 text-sm">Pausar worker</button>
          </form>

        </div> : null}
        </div>
        {web && daily?.byWallet[c.id] ? <div className="grid gap-3 border-t border-slate-100 px-5 py-4 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard label="Enviadas hoje" value={daily.byWallet[c.id].sent} />
          <MetricCard label="Aguardando envio" value={daily.byWallet[c.id].queued} />
          <MetricCard label="Falhas hoje" value={daily.byWallet[c.id].failed} />
          <MetricCard label="Sem confirmação hoje" value={daily.byWallet[c.id].uncertain} />
        </div> : null}
        {web ? <div className="space-y-3 border-t border-slate-100 bg-slate-50/70 px-5 py-4 text-sm">
          {state.command ? <p role="status" className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-900">{state.command}</p> : null}
          <p className="text-slate-700">{state.detail}</p>
          <p className="text-slate-700"><strong>Próximo passo:</strong> {state.next}</p>
          <div className="flex flex-wrap gap-x-8 gap-y-2 text-xs text-slate-600">
            <p><strong>Conexão informada:</strong> {stale ? 'sem sinal recente' : labels[session?.status ?? ''] ?? 'não confirmada'}</p>
            <p><strong>Permissão de envio:</strong> {control?.habilitado === false ? 'desabilitada' : control?.habilitado ? 'habilitada' : 'não confirmada'}</p>
            <p><strong>Recuperação automática:</strong> {state.supervisorOnline ? 'ativa' : 'sem sinal recente'} · {formatSignal(control?.supervisor_em ?? null)}</p>
            <a href="#pendencias-whatsapp" className={pendentes ? 'font-medium text-amber-800 underline' : 'text-slate-500'}>{pendentes} mensagem(ns) sem confirmação</a>
          </div>
        </div> : null}
        <details className="border-t border-slate-100 px-5 py-3">
          <summary className="cursor-pointer text-sm font-medium text-slate-600">Configurar canal, sessão e número</summary>
        <form action={configurarWhatsappWeb} className="mt-4 grid gap-4 md:grid-cols-3">
          <input type="hidden" name="carteira_id" value={c.id} />
          <label className="text-sm">Canal de envio<select name="transporte" defaultValue={c.whatsapp_transporte} className="mt-1 w-full rounded-xl border p-2"><option value="cloud">API oficial (Meta)</option><option value="web">WhatsApp Web temporário</option></select></label>
          <label className="text-sm">Nome da sessão<input name="sessao" defaultValue={c.whatsapp_web_sessao ?? 'gekali'} pattern="[a-zA-Z0-9_-]{1,60}" className="mt-1 w-full rounded-xl border p-2" /></label>
          <label className="text-sm">Número esperado (com DDI e DDD)<input name="numero" defaultValue={c.whatsapp_web_numero ?? ''} placeholder="5511999999999" className="mt-1 w-full rounded-xl border p-2" /></label>
          <div className="flex justify-end md:col-span-3"><button className="rounded-xl bg-emerald-700 px-4 py-2 text-sm font-medium text-white">Salvar configuração</button></div>
        </form>
        </details>
      </Card>
    })}</div>
    <Card id="pendencias-whatsapp">
      <h2 className="font-semibold">Reservas e envios que exigem conferência</h2>
      <p className="mt-1 text-sm text-slate-500">Uma mensagem incerta não bloqueia as demais. Você pode conferir o resultado ou autorizar um novo envio aceitando possível duplicidade, inclusive de anexos. Para registrar uma conferência, pause o worker acima e aguarde a pausa. Não reenvie uma reserva ainda em andamento.</p>
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
          {e.estado === 'incerto' ? <details className="mt-3"><summary className="cursor-pointer font-medium text-amber-800">Reenviar mesmo sem confirmação</summary>
            <form action={reenviarWhatsappIncerto} className="mt-3 grid gap-3">
              <input type="hidden" name="token" value={e.token} />
              <label><input type="checkbox" name="aceitar_duplicidade" required /> Aceito que o destinatário possa receber a mensagem e os anexos novamente.</label>
              <textarea name="observacao" required minLength={10} placeholder="Justificativa para o reenvio" className="rounded-xl border p-2" />
              <button className="rounded-xl border border-amber-300 px-4 py-2 text-amber-900">Autorizar reenvio</button>
            </form>
          </details> : null}
        </div>
      }) : <p className="text-sm text-slate-500">Nenhuma reserva pendente.</p>}</div>
    </Card>
  </div>
}
