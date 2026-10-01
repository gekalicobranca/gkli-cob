import Link from 'next/link'
import { requireAdmin } from '@/utils/auth/require-admin'
import { PageHeader } from '@/components/ui/page-header'
import { Card } from '@/components/ui/card'
import { MetricCard } from '@/components/data/metric-card'
import { WorkerAutoRefresh } from '@/components/configuracoes/worker-auto-refresh'
import { loadEmailMonitor } from '@/features/mensageria/email-monitor-query'
import { emailOperationStatus, type EmailCounts } from '@/features/mensageria/email-monitor-summary'

export const dynamic = 'force-dynamic'

function formatSignal(value: string | null | undefined) {
  return value && Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }) : 'Sem sinal registrado'
}
function Metrics({ counts }: { counts: EmailCounts }) {
  return <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
    <MetricCard label="Enviados hoje" value={counts.sent} hint="Envio confirmado pelo sistema" />
    <MetricCard label="Aguardando envio" value={counts.queued} hint="Agendados até hoje, incluindo atrasados" />
    <MetricCard label="Falhas hoje" value={counts.failed} hint="Exclui mensagens reagendadas" />
    <MetricCard label="Sem confirmação hoje" value={counts.uncertain} hint="Resultados incertos para conferência" />
    <MetricCard label="Em envio hoje" value={counts.sending} hint="Tentativas ainda sem resultado final" />
  </div>
}

export default async function EmailMonitorPage() {
  await requireAdmin()
  const now = new Date()
  const monitor = await loadEmailMonitor(now).catch(error => { console.error('Monitoramento de e-mails indisponível:', error); return null })
  const tones = { green: 'border-emerald-200 bg-emerald-50 text-emerald-800', amber: 'border-amber-200 bg-amber-50 text-amber-900', red: 'border-rose-200 bg-rose-50 text-rose-800', gray: 'border-slate-200 bg-slate-50 text-slate-600' }
  return <div className="space-y-5">
    <PageHeader eyebrow="Configurações" title="Monitoramento de e-mails" description="Acompanhe as contas de envio, a fila e os resultados de cada carteira." />
    <WorkerAutoRefresh updatedAt={now.toISOString()} />
    {!monitor ? <Card><p role="alert" className="text-amber-800">Não foi possível consultar o monitoramento de e-mails. Atualize novamente e verifique a conexão com o banco.</p></Card> : <>
      <section aria-label="Envios de e-mail do dia" className="space-y-3">
        <h2 className="text-sm font-semibold text-slate-700">E-mails · hoje, {now.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })} · Brasília</h2>
        <Metrics counts={monitor.total} />
      </section>
      <Card className="p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-slate-700">Verde: comunicação ou execução recente. Amarelo: configuração ou funcionamento a conferir. Vermelho: indisponível ou erro. Cinza: pausado.</p>
          <Link href="/app/configuracoes/integracoes" className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-emerald-800">Configurar integrações de e-mail</Link>
        </div>
        <details className="mt-3 border-t border-slate-100 pt-3">
          <summary className="cursor-pointer text-sm text-slate-500">Como interpretar o monitoramento</summary>
          <p className="mt-2 text-sm text-slate-600">Os totais incluem SMTP e Thunderbird. A fila considera as mensagens na agenda de e-mails, inclusive as atrasadas e as de Flows pausados. Mensagens futuras ficam fora do total de hoje.</p>
          <p className="mt-2 text-sm text-slate-600">“Enviado” confirma o resultado do envio pelo sistema; não comprova entrega na caixa de entrada ou leitura. SMTP mostra a última execução da rotina compartilhada. Thunderbird depende do computador ligado, do aplicativo aberto e da extensão conectada.</p>
          <p className="mt-2 text-sm text-slate-600">Uma tentativa sem confirmação deve ser conferida antes de reenviar. Este painel acompanha o estado informado; atualizar a tela não dispara mensagens nem testa as contas.</p>
        </details>
      </Card>
      {monitor.wallets.length === 0 ? <Card><p className="text-sm text-slate-500">Nenhuma carteira cadastrada.</p></Card> : monitor.wallets.map(wallet => {
        const thunderbird = wallet.email_transporte === 'thunderbird'
        const device = monitor.devices.find(d => d.carteira_id === wallet.id)
        const validConfig = (s: any) => Boolean(s.host && (s.remetente || s.usuario))
        const smtp = monitor.smtp.find(s => s.carteira_id === wallet.id && validConfig(s)) || monitor.smtp.find(s => s.carteira_id === null && validConfig(s))
        const from = thunderbird ? device?.email : smtp?.remetente || smtp?.usuario || monitor.envFrom
        const state = emailOperationStatus({ enabled: wallet.email_habilitado !== false, transport: wallet.email_transporte, configured: Boolean(smtp || monitor.envConfigured), device, worker: monitor.worker, now })
        const signal = thunderbird ? device?.visto_em : monitor.worker?.ultimo_sinal_em
        return <Card key={wallet.id} className="overflow-hidden p-0">
          <div className="flex flex-wrap items-start justify-between gap-4 px-5 py-5">
            <div className="space-y-2">
              <h2 className="text-lg font-semibold text-slate-950">{wallet.nome}</h2>
              <div className="flex flex-wrap items-center gap-3">
                <span role="status" className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold ${tones[state.tone]}`}><span aria-hidden="true" className="h-2.5 w-2.5 rounded-full bg-current" />{state.title}</span>
                <span className="text-sm text-slate-600">{from || 'Remetente não configurado'} · {thunderbird ? 'Thunderbird' : 'SMTP'}</span>
              </div>
              <p className="text-xs text-slate-500">{thunderbird ? 'Última comunicação' : 'Última execução da rotina'}: {formatSignal(signal)} · Brasília</p>
            </div>
            <Link href={`/app/configuracoes/integracoes?carteira=${wallet.id}`} className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium">Revisar integração</Link>
          </div>
          <div className="border-t border-slate-100 px-5 py-4"><Metrics counts={monitor.byWallet[wallet.id]} /></div>
          <div className="space-y-3 border-t border-slate-100 bg-slate-50/70 px-5 py-4 text-sm text-slate-700">
            <p>{state.detail}</p><p><strong>Próximo passo:</strong> {state.next}</p>
            <div className="flex flex-wrap gap-x-8 gap-y-2 text-xs text-slate-600">
              <p><strong>Limite diário da carteira:</strong> {wallet.email_limite_diario ?? 50}</p>
              <p><strong>Cópia de controle:</strong> {wallet.email_controle || 'Não configurada'}</p>
              {!thunderbird ? <p><strong>Configuração:</strong> {smtp ? smtp.carteira_id ? 'Própria da carteira' : 'Compartilhada' : monitor.envConfigured ? 'Compartilhada do ambiente' : 'Ausente'}</p> : <p><strong>Teste concluído:</strong> {formatSignal(device?.testado_em)}</p>}
            </div>
          </div>
        </Card>
      })}
      <Card id="pendencias-email" className="p-5">
        <h2 className="text-lg font-semibold text-slate-950">Falhas e envios para conferir</h2>
        <p className="mt-1 text-sm text-slate-500">{monitor.issues.length} mensagem(ns) com falha, resultado incerto ou tentativa em andamento. Inclui pendências anteriores a hoje.</p>
        <div className="mt-4 space-y-3">{monitor.issues.slice(0, 100).map(issue => <div key={issue.message.id} className="rounded-xl border border-slate-200 p-4 text-sm">
          <div className="flex flex-wrap justify-between gap-2"><strong>{monitor.wallets.find(w => w.id === issue.message.carteira_id)?.nome}</strong><span>{formatSignal(issue.at)}</span></div>
          <p className="mt-1 font-medium">{issue.state === 'uncertain' ? 'Sem confirmação · conferir antes de reenviar' : issue.state === 'sending' ? 'Tentativa em andamento · resultado ainda não registrado' : 'Falha no envio'}</p>
          {issue.message.erro_envio || issue.message.erro ? <p className="mt-1 break-words text-rose-700">{issue.message.erro_envio || issue.message.erro}</p> : null}
          <p className="mt-1 break-all text-xs text-slate-500">Mensagem: {issue.message.id}</p>
          <Link href={issue.message.lote_id ? `/app/lotes/${issue.message.lote_id}` : '/app/mensageria'} className="mt-2 inline-block text-emerald-700 underline">Conferir {issue.message.lote_id ? 'lote' : 'mensagens'}</Link>
        </div>)}</div>
        {!monitor.issues.length ? <p className="mt-3 text-sm text-slate-500">Nenhuma falha ou tentativa pendente de confirmação.</p> : null}
        {monitor.issues.length > 100 ? <p className="mt-3 text-xs text-slate-500">Exibindo as 100 ocorrências mais recentes. Consulte os demais registros em Disparos e logs.</p> : null}
      </Card>
    </>}
  </div>
}
