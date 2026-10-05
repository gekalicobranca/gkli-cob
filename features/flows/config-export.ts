import type { SupabaseClient } from '@supabase/supabase-js'

type Row = Record<string, any>
const sensitive = /senha|password|secret|token|cookie|credential|credencial|authorization|private.?key|api.?key|auth.?state|session.?data|vinculacao_payload|qr.?code/i

// Preserve string values (including template placeholders); scrub nested configuration keys.
export function sanitizeConfig(value: any): any {
  if (Array.isArray(value)) return value.map(sanitizeConfig)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(Object.entries(value).map(([key, item]) =>
    [key, sensitive.test(key) ? { secret_required: true } : sanitizeConfig(item)]))
}

const sourced = (row: Row, table: string): Row => ({ ...sanitizeConfig(row), source_id: row.id,
  source_system: 'gkli-cob', source_table: table })

export async function buildFlowConfigExport(db: SupabaseClient, env: Record<string, string | undefined> = process.env) {
  const warnings: string[] = []
  async function read(table: string, columns = '*', order = 'id'): Promise<Row[]> {
    const rows: Row[] = []
    for (let start = 0; ; ) {
      const { data, error } = await db.from(table).select(columns).order(order).range(start, start + 499)
      if (error) throw new Error(`Não foi possível ler ${table} (${error.code}). Exportação cancelada para evitar arquivo incompleto.`)
      const page = (data ?? []) as unknown as Row[]
      rows.push(...page)
      if (!page.length) break
      start += page.length
    }
    return rows
  }
  const [templates, reguas, etapas, smtp, wallets, sessions, controls, compliance] = await Promise.all([
    read('mensagens_templates'), read('reguas'), read('regua_etapas'), read('integracoes_smtp_config'),
    read('carteiras', 'id,nome,email_habilitado,email_controle,email_limite_diario,email_transporte,whatsapp_habilitado,whatsapp_transporte,whatsapp_remetente_modo,whatsapp_numero_proprio,whatsapp_phone_number_id,whatsapp_waba_id,whatsapp_web_sessao,whatsapp_web_numero'),
    read('whatsapp_web_sessoes', 'id,numero'), read('whatsapp_worker_controles', 'sessao,habilitado', 'sessao'),
    read('regua_compliance_regras'),
  ])
  const data: Record<string, Row[]> = {
    carteiras: [], templates: templates.map(r => {
      const config = sourced(r, 'mensagens_templates')
      delete config.analytics
      return config
    }),
    reguas: reguas.map(r => sourced(r, 'reguas')),
    etapas: etapas.sort((a, b) => String(a.regua_id).localeCompare(String(b.regua_id)) || a.ordem - b.ordem || String(a.id).localeCompare(String(b.id))).map(r => sourced(r, 'regua_etapas')),
    smtp_configs: smtp.map(r => ({ ...sourced(r, 'integracoes_smtp_config'), secret_required: true })),
    whatsapp_cloud_configs: [], whatsapp_web_configs: [], worker_configs: [],
    processing_configs: compliance.map(r => ({ ...sourced(r, 'regua_compliance_regras'), tipo: 'compliance' })),
  }
  if (env.SMTP_HOST) data.smtp_configs.push({ source_id: 'env:smtp', source_system: 'gkli-cob', origem: 'environment',
    host: env.SMTP_HOST, porta: Number(env.SMTP_PORT ?? 587), usuario: env.SMTP_USER ?? null,
    remetente: env.SMTP_FROM || env.SMTP_USER || null, secure: env.SMTP_SECURE?.toLowerCase() === 'true' || Number(env.SMTP_PORT ?? 587) === 465,
    starttls: (env.SMTP_STARTTLS ?? 'true').toLowerCase() !== 'false', ehlo_domain: env.SMTP_EHLO_DOMAIN || 'gkli.local', secret_required: true })
  const cloudBase = { api_version: env.WHATSAPP_GRAPH_API_VERSION || 'v24.0', secret_required: true,
    business_account_id: env.WHATSAPP_BUSINESS_ACCOUNT_ID ?? null }
  if (env.WHATSAPP_PHONE_NUMBER_ID) data.whatsapp_cloud_configs.push({ ...cloudBase,
    source_id: 'env:whatsapp-cloud', source_system: 'gkli-cob', carteira_id: null, phone_number_id: env.WHATSAPP_PHONE_NUMBER_ID })
  for (const wallet of wallets) {
    data.processing_configs.push({ source_id: wallet.id, source_system: 'gkli-cob', tipo: 'canais_carteira',
      carteira_id: wallet.id, email_habilitado: wallet.email_habilitado, email_controle: wallet.email_controle,
      email_limite_diario: wallet.email_limite_diario, email_transporte: wallet.email_transporte,
      whatsapp_habilitado: wallet.whatsapp_habilitado, whatsapp_transporte: wallet.whatsapp_transporte })
    if (wallet.whatsapp_phone_number_id || wallet.whatsapp_transporte === 'cloud') data.whatsapp_cloud_configs.push({ ...cloudBase,
      source_id: wallet.id, source_system: 'gkli-cob', carteira_id: wallet.id, nome: wallet.nome,
      transporte: wallet.whatsapp_transporte, remetente_modo: wallet.whatsapp_remetente_modo,
      business_account_id: wallet.whatsapp_waba_id || cloudBase.business_account_id,
      numero_proprio: wallet.whatsapp_numero_proprio, ativo: wallet.whatsapp_habilitado,
      phone_number_id: wallet.whatsapp_remetente_modo === 'proprio' ? wallet.whatsapp_phone_number_id : env.WHATSAPP_PHONE_NUMBER_ID || null })
    if (wallet.whatsapp_web_sessao) data.whatsapp_web_configs.push({ source_id: wallet.whatsapp_web_sessao,
      source_system: 'gkli-cob', carteira_id: wallet.id, sessao: wallet.whatsapp_web_sessao,
      numero: wallet.whatsapp_web_numero, ativo: wallet.whatsapp_habilitado, transporte: wallet.whatsapp_transporte, pairing_required: true })
  }
  for (const session of sessions) {
    if (!data.whatsapp_web_configs.some(r => r.sessao === session.id)) data.whatsapp_web_configs.push({
      source_id: session.id, source_system: 'gkli-cob', sessao: session.id, numero: session.numero, pairing_required: true })
  }
  data.worker_configs = controls.map(r => ({ source_id: r.sessao, source_system: 'gkli-cob', tipo: 'whatsapp_web',
    nome: r.sessao, canal: 'whatsapp', sessao: r.sessao, ativo: r.habilitado, concurrency: 1, batch_size: 1,
    interval_ms: 10000, heartbeat_expected_ms: 30000, initialization_timeout_ms: 900000, timeout_ms: 45000,
    query_timeout_ms: 15000, carteira_ids: wallets.filter(w => w.whatsapp_web_sessao === r.sessao).map(w => w.id) }))
  data.worker_configs.push({ source_id: 'code:whatsapp-cloud-worker', source_system: 'gkli-cob', tipo: 'whatsapp_cloud',
    canal: 'whatsapp', interval_ms: Math.max(15000, Number(env.WHATSAPP_WORKER_INTERVAL_MS ?? 60000)), batch_size: 50 })
  data.processing_configs.push({ source_id: 'code:whatsapp-cloud-retry', source_system: 'gkli-cob', tipo: 'retry',
    canal: 'whatsapp_cloud', max_attempts: 3, backoff: 'min(60, 2 ** attempt * 5) minutes', timeout_ms: 5000,
    retry_condition: 'retryable provider error (HTTP 429 or >= 500)' },
  { source_id: 'code:flow-budget', source_system: 'gkli-cob', tipo: 'protecao_carga', timeout_ms: 90000,
    max_queries: 400, query_timeout_ms: 15000 })

  const referenced = new Set<string>()
  for (const rows of Object.values(data)) for (const r of rows) if (r.carteira_id) referenced.add(r.carteira_id)
  warnings.push('Carteiras: campo codigo não existe no COB; exportado como null.')
  data.carteiras = wallets.filter(w => referenced.has(w.id)).map(w => ({ id: w.id, nome: w.nome, codigo: null,
    source_id: w.id, source_system: 'gkli-cob' }))
  const ids = (rows: Row[]) => new Map(rows.map(r => [r.id, r]))
  const templateIds = ids(templates), reguaIds = ids(reguas), walletIds = ids(wallets)
  for (const step of etapas) {
    if (!reguaIds.has(step.regua_id)) warnings.push(`Etapa ${step.id}: régua inexistente ${step.regua_id}.`)
    if (step.template_id && !templateIds.has(step.template_id)) warnings.push(`Etapa ${step.id}: template inexistente ${step.template_id}.`)
    else if (step.template_id && templateIds.get(step.template_id)?.ativo === false) warnings.push(`Etapa ${step.id}: utiliza template inativo ${step.template_id}.`)
  }
  for (const regua of reguas) if (!etapas.some(e => e.regua_id === regua.id)) warnings.push(`Régua ${regua.id}: sem etapas.`)
  for (const [group, rows] of Object.entries(data)) {
    const seen = new Set<string>()
    for (const row of rows) {
      const key = `${row.source_table ?? ''}:${row.source_id}:${row.carteira_id ?? ''}`
      if (seen.has(key)) warnings.push(`${group}: registro duplicado ${row.source_id}.`)
      seen.add(key)
      if (row.carteira_id && !walletIds.has(row.carteira_id)) warnings.push(`${group} ${row.source_id}: carteira inexistente ${row.carteira_id}.`)
    }
  }
  const orders = new Set<string>()
  for (const step of etapas) {
    const key = `${step.regua_id}:${step.ordem}`
    if (orders.has(key)) warnings.push(`Régua ${step.regua_id}: ordem de etapa duplicada ${step.ordem}.`)
    orders.add(key)
  }
  return { schema: 'gkli-flow-config-export', version: '1.0', generated_at: new Date().toISOString(), source: 'gkli-cob',
    data, validation: { counts: Object.fromEntries(Object.entries(data).map(([key, rows]) => [key, rows.length])), warnings,
      notes: ['Parâmetros de código identificam a implementação atual; ambientes de workers externos podem sobrescrever parâmetros e devem ser conferidos na migração.',
        'Leituras paginadas; alterações concorrentes durante a exportação podem afetar a consistência.'] } }
}
