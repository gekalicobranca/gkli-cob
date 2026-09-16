import { createAdminClient } from '@/utils/supabase/admin'
import { renderTemplate } from '@/features/mensageria/render-template'

export function agruparEmailsUnidade(rows: any[]) {
  const grupos = new Map<string, any[]>()
  for (const m of rows) {
    const c = Array.isArray(m.cobranca) ? m.cobranca[0] : m.cobranca
    if (!c?.unidade_id || !m.destinatario || m.canal !== 'email') continue
    const key = `${m.carteira_id}|${c.unidade_id}|${m.destinatario.trim().toLowerCase()}`
    const grupo = grupos.get(key) ?? []
    grupo.push({ ...m, cobranca: c })
    grupos.set(key, grupo)
  }
  return [...grupos.values()].filter(g => g.length > 1).map(grupo => {
    // A etapa mais avançada representa a situação da unidade.
    grupo.sort((a, b) => Number(b.payload?.dias_atraso ?? 0) - Number(a.payload?.dias_atraso ?? 0))
    const principal = grupo[0]
    const valor = grupo.reduce((sum, m) => sum + Number(m.cobranca.valor_atualizado ?? m.cobranca.valor_original ?? 0), 0)
    const dinheiro = valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
    const contexto = { ...principal.payload?.contexto, valor: dinheiro, valor_total: dinheiro,
      competencia: [...new Set(grupo.map(m => m.cobranca.competencia).filter(Boolean))].join(', '),
      vencimento: [...new Set(grupo.map(m => m.payload?.contexto?.vencimento).filter(Boolean))].join(', ') }
    const fonte = principal.payload?.template_resolvido?.conteudo
    if (!fonte) throw new Error('Template original ausente: não foi possível consolidar a unidade com segurança.')
    return { principal: principal.id, ids: grupo.map(m => m.id),
      conteudo: renderTemplate(fonte, contexto),
      payload: { ...principal.payload, contexto, cobranca_ids: grupo.map(m => m.cobranca_id),
        fingerprints: grupo.map(m => m.fingerprint), total_cobrancas: grupo.length } }
  })
}

export async function consolidarEmailsLote(loteId: string) {
  const db = createAdminClient()
  const rows: any[] = []
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await db.from('mensagens')
      .select('*,cobranca:cobrancas(unidade_id,valor_atualizado,valor_original,competencia)')
      .eq('lote_id', loteId).eq('status', 'pendente_aprovacao').eq('canal', 'email').order('id').range(offset, offset + 499)
    if (error) throw new Error(error.message)
    rows.push(...(data ?? []))
    if ((data ?? []).length < 500) break
  }
  for (const grupo of agruparEmailsUnidade(rows)) {
    const { error } = await db.rpc('email_consolidar_unidade', { p_lote: loteId, p_principal: grupo.principal,
      p_ids: grupo.ids, p_conteudo: grupo.conteudo, p_payload: grupo.payload })
    if (error) throw new Error(`Erro ao consolidar e-mails da unidade: ${error.message}`)
  }
}
