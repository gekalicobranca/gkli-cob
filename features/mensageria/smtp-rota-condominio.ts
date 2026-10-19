import type { SupabaseClient } from '@supabase/supabase-js'

/** Somente configuração administrativa; nunca escolhe credenciais pelo payload da mensagem. */
export async function buscarRotaSmtpFlow(db: SupabaseClient, mensagemId: string, carteiraId: string) {
  const { data: m, error } = await db.from('mensagens')
    .select('carteira_id,cobranca_id,acordo_id,cobranca_flow_id,acordo_flow_id,pre_juridico_flow_id').eq('id', mensagemId).single()
  if (error || !m || m.carteira_id !== carteiraId) throw new Error('Não foi possível validar a carteira da mensagem SMTP.')
  if (m.pre_juridico_flow_id || (!m.cobranca_flow_id && !m.acordo_flow_id)) return null
  const entidades: Array<{ condominio_id: string; carteira_id: string }> = []
  for (const [tabela, id] of [['cobrancas', m.cobranca_id], ['acordos', m.acordo_id]] as const) {
    if (!id) continue
    const { data, error } = await db.from(tabela).select('condominio_id,carteira_id').eq('id', id).single()
    if (error || !data || data.carteira_id !== carteiraId) throw new Error('Vínculo financeiro inválido para o remetente SMTP.')
    entidades.push(data)
  }
  if (!entidades.length) throw new Error('Flow sem condomínio verificável para envio SMTP.')
  const condominioId = entidades[0].condominio_id
  if (entidades.some(e => e.condominio_id !== condominioId)) throw new Error('Mensagem vinculada a condomínios diferentes.')
  const { data: condominio, error: condoError } = await db.from('condominios').select('carteira_id').eq('id', condominioId).single()
  if (condoError || condominio?.carteira_id !== carteiraId) throw new Error('Condomínio fora da carteira do envio SMTP.')
  const { data: rota, error: rotaError } = await db.from('integracoes_smtp_rotas_condominio')
    .select('carteira_id,smtp_config_id,remetente_email,responder_para,ativo').eq('condominio_id', condominioId).maybeSingle()
  if (rotaError) throw new Error('Não foi possível conferir o remetente específico do condomínio.')
  if (!rota) return null
  // Uma rota cadastrada que ficou inválida bloqueia o envio; não cai na conta padrão silenciosamente.
  if (!rota.ativo || rota.carteira_id !== carteiraId) throw new Error('Rota SMTP do condomínio inativa ou fora da carteira.')
  const { data: config, error: configError } = await db.from('integracoes_smtp_config')
    .select('id,auth_method,ativo,host,porta,usuario,senha,remetente,secure,starttls,ehlo_domain').eq('id', rota.smtp_config_id).single()
  if (configError || !config?.ativo) throw new Error('Conta SMTP específica do condomínio indisponível.')
  return { config, remetente: rota.remetente_email as string, responderPara: rota.responder_para as string }
}
