import { createAdminClient } from '@/utils/supabase/admin'
import { summarizeEmailMonitor } from './email-monitor-summary'

export async function loadEmailMonitor(now: Date, db = createAdminClient()) {
  async function all(table: string, columns: string, filter?: (q: any) => any) {
    const rows: any[] = []
    for (let offset = 0; ; offset += 1000) {
      const key = table === 'email_agenda' ? 'mensagem_id' : table === 'agente_workers' ? 'script_key' : 'id'
      let q = db.from(table as any).select(columns).order(key).range(offset, offset + 999)
      if (filter) q = filter(q)
      const result = await q
      if (result.error) throw new Error(`Não foi possível consultar ${table}.`)
      rows.push(...result.data)
      if (result.data.length < 1000) return rows
    }
  }
  const [wallets, devices, smtp, workers, messages, attempts, agenda] = await Promise.all([
    all('carteiras', 'id,nome,email_habilitado,email_transporte,email_limite_diario,email_controle'),
    all('thunderbird_dispositivos', 'id,carteira_id,email,automatico,testado_em,visto_em', q => q.eq('ativo', true)),
    all('integracoes_smtp_config', 'id,carteira_id,host,remetente,usuario,atualizado_em', q => q.eq('ativo', true)),
    all('agente_workers', 'script_key,ultimo_sinal_em,metadata_json', q => q.eq('script_key', 'mensageria:email')),
    all('mensagens', 'id,carteira_id,status,agendada_para,sent_at,enviada_em,ultima_tentativa_em,updated_at,erro_envio,erro,lote_id', q => q.eq('canal', 'email').in('status', ['enviada', 'agendada', 'falha', 'cancelada'])),
    all('email_tentativas', 'id,mensagem_id,carteira_id,estado,iniciado_em,finalizado_em'),
    all('email_agenda', 'mensagem_id', q => q),
  ])
  const summary = summarizeEmailMonitor(messages, attempts, wallets.map(w => w.id), agenda.map(a => a.mensagem_id), now)
  smtp.sort((a, b) => Date.parse(b.atualizado_em) - Date.parse(a.atualizado_em))
  const envFrom = process.env.SMTP_FROM || process.env.SMTP_USER || null
  return { ...summary, wallets: wallets.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')), devices, smtp, worker: workers[0] ?? null,
    envConfigured: Boolean(process.env.SMTP_HOST && envFrom), envFrom }
}
