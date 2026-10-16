import { renderTemplate } from '@/features/mensageria/render-template'

// Cada mensagem pode já representar várias parcelas; não somar apenas a principal.
export function planejarConsolidacaoEmailsPendentes(rows: any[], cobrancas: any[]) {
  const porId = new Map(cobrancas.map(c => [c.id, c]))
  const grupos = new Map<string, any[]>()
  for (const m of rows) {
    if (m.canal !== 'email' || !['pendente_aprovacao', 'aprovada', 'agendada'].includes(m.status)
      || m.sent_at || m.enviada_em || m.enviado_em || m.provider_message_id
      || m.tentativas?.some((t: any) => ['em_envio', 'incerto', 'enviado'].includes(t.estado))) continue
    const c = porId.get(m.cobranca_id)
    if (!c?.unidade_id) continue
    const ciclo = m.fingerprint?.split(':').at(-1) || m.created_at?.slice(0, 7)
    const key = JSON.stringify([m.carteira_id, c.unidade_id, m.destinatario?.trim().toLowerCase(), m.regua_etapa_id, ciclo])
    const grupo = grupos.get(key) ?? []
    grupo.push(m)
    grupos.set(key, grupo)
  }
  return [...grupos.values()].filter(g => g.length > 1).map(grupo => {
    grupo.sort((a, b) => String(a.agendada_para || a.scheduled_at || a.created_at).localeCompare(String(b.agendada_para || b.scheduled_at || b.created_at)))
    const principal = grupo[0]
    const ids = [...new Set<string>(grupo.flatMap(m => [m.cobranca_id, ...(m.payload?.cobranca_ids ?? [])]).filter(Boolean))]
    const parcelas = ids.map(id => {
      const c = porId.get(id)
      if (!c) throw new Error('Parcela consolidada não encontrada; nenhuma mensagem foi alterada.')
      if (c.unidade_id !== porId.get(principal.cobranca_id)?.unidade_id) throw new Error('As parcelas pertencem a unidades diferentes.')
      return c
    })
    const centavos = parcelas.reduce((total, c) => total + Math.round(Number(c.valor_atualizado ?? c.valor_original ?? 0) * 100), 0)
    const valor = (centavos / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
    const contexto = { ...principal.payload?.contexto, valor, valor_total: valor,
      competencia: [...new Set(parcelas.map(c => c.competencia).filter(Boolean))].join(', '),
      vencimento: [...new Set(parcelas.map(c => c.vencimento).filter(Boolean))].join(', ') }
    const fonte = principal.payload?.template_resolvido?.conteudo
    if (!fonte) throw new Error('Template original ausente; nenhuma mensagem foi alterada.')
    return { principal: principal.id, ids: grupo.map(m => m.id),
      conteudo: renderTemplate(fonte, contexto),
      payload: { ...principal.payload, contexto, cobranca_ids: ids,
        fingerprints: [...new Set(grupo.flatMap(m => [m.fingerprint, ...(m.payload?.fingerprints ?? [])]).filter(Boolean))],
        total_cobrancas: ids.length, consolidacao_mensagens: grupo.map(m => m.id) } }
  })
}
