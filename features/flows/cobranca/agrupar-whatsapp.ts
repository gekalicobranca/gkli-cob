import { renderTemplate } from '@/features/mensageria/render-template'

const telefone = (value: unknown) => {
  const digits = String(value ?? '').replace(/\D/g, '')
  return digits.length === 10 || digits.length === 11 ? `55${digits}` : digits
}

export function agruparWhatsAppUnidade(rows: any[]) {
  const grupos = new Map<string, any[]>()
  for (const m of rows) {
    const c = Array.isArray(m.cobranca) ? m.cobranca[0] : m.cobranca
    if (m.canal !== 'whatsapp' || !c?.unidade_id || !m.destinatario || m.provider_message_id || m.envios?.length) continue
    if (!['pendente_aprovacao', 'aprovada', 'agendada'].includes(m.status)) continue
    const key = JSON.stringify([m.lote_id, m.cobranca_flow_id, m.carteira_id, c.unidade_id, telefone(m.destinatario), m.status])
    const grupo = grupos.get(key) ?? []
    grupo.push({ ...m, cobranca: c })
    grupos.set(key, grupo)
  }
  return [...grupos.values()].filter(g => g.length > 1).map(grupo => {
    grupo.sort((a, b) => Number(b.payload?.dias_atraso ?? 0) - Number(a.payload?.dias_atraso ?? 0) || a.id.localeCompare(b.id))
    // Reprocessing an already consolidated message keeps all represented debts.
    const ids = [...new Set<string>(grupo.flatMap(m => m.payload?.cobranca_ids?.length ? m.payload.cobranca_ids : [m.cobranca_id]))]
    if (ids.length !== grupo.length || grupo.some(m => m.payload?.total_cobrancas > 1)) {
      throw new Error('Grupo parcialmente consolidado; revise antes de juntar novas cobranças.')
    }
    const principal = grupo[0]
    const valor = grupo.reduce((sum, m) => sum + Number(m.cobranca.valor_atualizado ?? m.cobranca.valor_original ?? 0), 0)
    if (!Number.isFinite(valor)) throw new Error('Valor inválido na consolidação do WhatsApp.')
    const dinheiro = valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
    const contexto = { ...principal.payload?.contexto, valor: dinheiro, valor_total: dinheiro,
      competencia: [...new Set(grupo.map(m => m.cobranca.competencia).filter(Boolean))].join(', '),
      vencimento: [...new Set(grupo.map(m => m.payload?.contexto?.vencimento).filter(Boolean))].join(', ') }
    const fonte = principal.payload?.template_resolvido?.conteudo
    if (!fonte) throw new Error('Template original ausente; WhatsApp preservado para revisão.')
    return { lote: principal.lote_id, principal: principal.id, ids: grupo.map(m => m.id),
      conteudo: renderTemplate(fonte, contexto),
      payload: { ...principal.payload, contexto, cobranca_ids: ids, fingerprints: grupo.map(m => m.fingerprint),
        total_cobrancas: ids.length, consolidacao: 'whatsapp_unidade' } }
  })
}
