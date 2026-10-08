import type { SupabaseClient } from '@supabase/supabase-js'

/** Fila existente de coleta. A carteira vem do condomínio, inclusive após migrações. */
export async function enfileirarColetaReceita(supabase: SupabaseClient, input: {
  receitaId: string; solicitadoPor: string | null; carteiraIds: string[] | null; origem?: 'manual' | 'maestro'; execucaoId?: string
}) {
  const { data: receita, error: receitaError } = await supabase.from('agente_receitas')
    .select('id, administradora_id, carteira_id, ativo, condominio_id:config_json->>condominio_id, administradora:agente_administradoras!inner(ativo)')
    .eq('id', input.receitaId).single()
  if (receitaError || !receita) throw new Error(receitaError?.message ?? 'Receita não encontrada.')
  const administradora = Array.isArray(receita.administradora) ? receita.administradora[0] : receita.administradora
  if (!receita.ativo || !administradora?.ativo) throw new Error('Agente remoto inativo.')
  const condominioId = receita.condominio_id as string | null
  let carteiraId = receita.carteira_id as string
  if (condominioId) {
    const { data: condominio, error } = await supabase.from('condominios').select('carteira_id').eq('id', condominioId).single()
    if (error || !condominio) throw new Error(error?.message ?? 'Condomínio não encontrado.')
    carteiraId = condominio.carteira_id
  }
  if (input.carteiraIds !== null && !input.carteiraIds.includes(carteiraId)) throw new Error('Condomínio fora das carteiras permitidas.')
  const { data: pendente, error: pendenteError } = await supabase.from('agente_execucoes')
    .select('id').eq('receita_id', receita.id).eq('carteira_id', carteiraId)
    .in('status', ['pendente', 'em_execucao']).is('agendado_para', null)
    .order('created_at', { ascending: false }).limit(1).maybeSingle()
  if (pendenteError) throw new Error(pendenteError.message)
  if (pendente) return { execucaoId: pendente.id as string, condominioId, reutilizada: true }
  const { data: execucao, error } = await supabase.from('agente_execucoes').insert({
    ...(input.execucaoId ? { id: input.execucaoId } : {}),
    receita_id: receita.id, administradora_id: receita.administradora_id, carteira_id: carteiraId,
    condominio_id: condominioId, status: 'pendente', solicitado_por: input.solicitadoPor,
    tentativas: 0, origem: input.origem ?? 'manual',
  }).select('id').single()
  if (error?.code === '23505' && input.execucaoId) {
    const { data: concorrente, error: concorrenteError } = await supabase.from('agente_execucoes')
      .select('id').eq('id', input.execucaoId).eq('receita_id', receita.id).eq('carteira_id', carteiraId).single()
    if (concorrenteError || !concorrente) throw new Error(concorrenteError?.message ?? 'Execução concorrente inválida.')
    return { execucaoId: concorrente.id as string, condominioId, reutilizada: true }
  }
  if (error || !execucao) throw new Error(error?.message ?? 'Não foi possível criar a execução.')
  const { error: logError } = await supabase.from('agente_logs').insert({
    execucao_id: execucao.id, nivel: 'info', step: 'fila',
    mensagem: 'Execução criada. Aguardando worker externo Playwright processar a coleta.',
  })
  if (logError) throw new Error(`Execução ${execucao.id} criada, mas o registro do log falhou: ${logError.message}`)
  return { execucaoId: execucao.id as string, condominioId, reutilizada: false }
}
