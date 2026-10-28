import { somenteCobrancasCanonicas } from '@/lib/core/cobranca-arquivamento'
import { applyCarteiraScope } from '@/utils/auth/apply-carteira-scope'
import type { CarteiraScope } from '@/utils/auth/get-permitted-carteiras'
import { normalizeRelationsList } from '@/utils/supabase/normalize-relation'
import { ACORDO_STATUS_ATIVOS } from '@/lib/core/status'

export async function lerTodasPaginas(query: any, contexto: string): Promise<any[]> {
  const rows: any[] = []
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await query.range(offset, offset + 499)
    if (error) throw new Error(`Erro ao carregar ${contexto}: ${error.message}`)
    rows.push(...(data ?? []))
    if ((data ?? []).length < 500) return rows
  }
}

export function condominioDoOperador(condominio: any, scope: CarteiraScope) {
  if (scope.perfil !== 'operador') return true
  const carteira = Array.isArray(condominio.carteiras) ? condominio.carteiras[0] : condominio.carteiras
  return (condominio.operador_id ?? carteira?.operador_id) === scope.userId
}

export function filtrarCobrancasInbox(rows: any[], judicializadas: Set<string>, cobertas: Set<string>, hoje: string) {
  return rows.filter(row => !row.duplicada_de_id && !row.data_pagamento
    && (row.status_financeiro ?? 'em_aberto') === 'em_aberto'
    && row.vencimento && row.vencimento <= hoje
    && Number(row.valor_atualizado ?? row.valor_original ?? 0) > 0
    && !['acordo_firmado', 'acordo_efetivado', 'cancelado', 'quitado', 'pago'].includes(row.status_operacional ?? row.status)
    && !judicializadas.has(row.unidade_id) && !cobertas.has(row.id))
}

/** Fila de trabalho por responsável atual do condomínio, sem alterar a autoria histórica. */
export async function carregarBaseInbox(db: any, scope: CarteiraScope, leituraInterna = db) {
  const hoje = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
  const condominios = await lerTodasPaginas(applyCarteiraScope(db.from('condominios')
    .select('id,operador_id,carteiras(operador_id)').eq('status', 'ativo').order('id'), scope.carteiraIds), 'condomínios do inbox')
  const ids = condominios.filter(c => condominioDoOperador(c, scope)).map(c => c.id)
  if (!ids.length) return { acordos: [], cobrancas: [] }
  // Only the server supplies leituraInterna. Authorization above always uses the user's
  // RLS client first; every internal read is bounded by those condo IDs and wallet scope.
  // This avoids repeatedly evaluating nested RLS for the complete operational catalog.
  const selecionar = (table: string, fields: string) => applyCarteiraScope(leituraInterna.from(table).select(fields).in('condominio_id', ids).order('id'), scope.carteiraIds)
  const [acordosRows, cobrancasRows, judiciais, periodos, casos] = await Promise.all([
    lerTodasPaginas(selecionar('acordos', `id,condominio_id,unidade_id,cobranca_id,tipo,status,status_financeiro,risco,valor_acordado,entrada,data_acordo,numero_processo,condominios(nome),unidades(identificacao,bloco,responsavel_nome,responsavel_documento,email,telefone,acao_judicial,numero_processo),acordo_cobrancas(cobranca_id,cobrancas(unidade_id))`), 'acordos do inbox'),
    lerTodasPaginas(somenteCobrancasCanonicas(selecionar('cobrancas', `id,unidade_id,condominio_id,competencia,vencimento,valor_original,valor_atualizado,status,status_operacional,status_financeiro,data_pagamento,dias_atraso,score_prioridade,ultima_interacao_at,condominios(nome),unidades(identificacao,bloco,responsavel_nome,responsavel_documento,email,telefone,acao_judicial,numero_processo)`)).eq('status_financeiro', 'em_aberto').is('data_pagamento', null).lte('vencimento', hoje), 'cobranças do inbox'),
    lerTodasPaginas(somenteCobrancasCanonicas(selecionar('cobrancas', 'id,unidade_id')).eq('status_operacional', 'judicializado'), 'unidades judicializadas'),
    // This internal table is service-only. IDs are restricted to the active condominiums
    // already authorized through the user's RLS and operational assignment above.
    lerTodasPaginas(applyCarteiraScope(leituraInterna.from('judicial_cotas_periodos').select('id,unidade_id')
      .in('condominio_id', ids).eq('ativo', true).order('id'), scope.carteiraIds), 'períodos judiciais'),
    lerTodasPaginas(selecionar('pre_juridico_casos', 'id,unidade_id').or('etapa.eq.judicializado,distribuicao_status.eq.distribuido'), 'processos distribuídos'),
  ])
  const acordos = normalizeRelationsList(acordosRows, ['condominios', 'unidades'])
  const cobrancas = normalizeRelationsList(cobrancasRows, ['condominios', 'unidades'])
  const judicializadas = new Set<string>([...judiciais, ...periodos, ...casos].map(r => r.unidade_id))
  const cobertas = new Set<string>()
  for (const c of cobrancas) if (c.unidades?.acao_judicial || String(c.unidades?.numero_processo ?? '').trim()) judicializadas.add(c.unidade_id)
  for (const a of acordos) {
    if (a.unidades?.acao_judicial || String(a.unidades?.numero_processo ?? '').trim()) judicializadas.add(a.unidade_id)
    const judicial = a.tipo === 'judicial' || String(a.numero_processo ?? '').trim()
    if (judicial && a.unidade_id) judicializadas.add(a.unidade_id)
    const cobre = !['cancelado', 'quebrado', 'renegociado', 'rompido'].includes(a.status)
    if (cobre && a.cobranca_id) cobertas.add(a.cobranca_id)
    for (const ac of a.acordo_cobrancas ?? []) {
      if (cobre) cobertas.add(ac.cobranca_id)
      const c = Array.isArray(ac.cobrancas) ? ac.cobrancas[0] : ac.cobrancas
      if (judicial && c?.unidade_id) judicializadas.add(c.unidade_id)
    }
  }
  const ativos = acordos.filter(a => a.tipo === 'extrajudicial' && !judicializadas.has(a.unidade_id) && (ACORDO_STATUS_ATIVOS as string[]).includes(a.status))
  const parcelas: any[] = []
  for (let start = 0; start < ativos.length; start += 150) {
    // Parent agreement IDs are scoped above; parcelas_acordo has no carteira_id column.
    parcelas.push(...await lerTodasPaginas(leituraInterna.from('parcelas_acordo').select('id,acordo_id,vencimento,status,data_pagamento')
      .in('acordo_id', ativos.slice(start, start + 150).map(a => a.id)).order('id'), 'parcelas do inbox'))
  }
  const porAcordo = new Map<string, any[]>()
  for (const p of parcelas) { const ps = porAcordo.get(p.acordo_id) ?? []; ps.push(p); porAcordo.set(p.acordo_id, ps) }
  return { acordos: ativos.map(a => ({ ...a, parcelas_acordo: porAcordo.get(a.id) ?? [] })), cobrancas: filtrarCobrancasInbox(cobrancas, judicializadas, cobertas, hoje) }
}
