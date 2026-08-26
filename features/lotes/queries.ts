import { notFound } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'
import { applyCarteiraScope } from '@/utils/auth/apply-carteira-scope'
import type { CarteiraScope } from '@/utils/auth/get-permitted-carteiras'

const LOTE_LIST_LIMIT = 200
const LOTE_ITEM_DETAIL_LIMIT = 250

export async function listLotesRegua(scope: CarteiraScope) {
  const supabase = await createClient()

  let query = supabase
    .from('lotes')
    .select(`
      id,
      carteira_id,
      tipo,
      status,
      observacoes,
      total_avaliadas,
      total_criadas,
      total_puladas,
      total_duplicadas,
      total_erros,
      total_pendentes,
      total_aprovadas,
      total_enviadas,
      resumo,
      iniciado_em,
      finalizado_em,
      created_at,
      regua:reguas(
        id,
        nome,
        tipo
      )
    `)
    .order('created_at', { ascending: false })
    .limit(LOTE_LIST_LIMIT)

  query = applyCarteiraScope(query, scope.carteiraIds)

  const { data, error } = await query

  if (error) {
    throw new Error(`Erro ao carregar lotes: ${error.message}`)
  }

  return data ?? []
}

export async function getLoteDetalhe(id: string, scope: CarteiraScope) {
  const supabase = await createClient()

  let loteQuery = supabase
    .from('lotes')
    .select(`
      id,
      carteira_id,
      tipo,
      status,
      operador_id,
      observacoes,
      total_avaliadas,
      total_criadas,
      total_puladas,
      total_duplicadas,
      total_erros,
      total_pendentes,
      total_aprovadas,
      total_enviadas,
      resumo,
      iniciado_em,
      finalizado_em,
      created_at,
      regua:reguas(
        id,
        nome,
        tipo
      )
    `)
    .eq('id', id)

  loteQuery = applyCarteiraScope(loteQuery, scope.carteiraIds)

  const { data: lote, error: loteError } = await loteQuery.maybeSingle()

  if (loteError) {
    throw new Error(`Erro ao carregar lote: ${loteError.message}`)
  }

  if (!lote) {
    notFound()
  }

  const { count: totalItens, error: totalItensError } = await supabase
    .from('lote_itens')
    .select('id', { count: 'exact', head: true })
    .eq('lote_id', id)

  if (totalItensError) {
    throw new Error(`Erro ao contar itens do lote: ${totalItensError.message}`)
  }

  const { data: emailAprovado } = await supabase
    .from('mensagens')
    .select('id')
    .eq('lote_id', id)
    .eq('canal', 'email')
    .or('status.eq.aprovada,status_operacional.eq.aprovada')
    .limit(1)

  const { data: itens, error: itensError } = await supabase
    .from('lote_itens')
    .select(`
      id,
      lote_id,
      cobranca_id,
      acordo_id,
      status,
      created_at,
      unidade_id,
      condominio_id,
      regua_etapa_id,
      mensagem_id,
      retorno_tipo,
      retorno_observacao,
      retorno_registrado_em,
      motivo,
      fingerprint,
      payload,
      cobranca:cobrancas(
        id,
        status,
        status_operacional,
        estado,
        valor_original,
        valor_atualizado,
        vencimento,
        unidade:unidades(
          id,
          identificacao,
          responsavel_nome,
          telefone,
          email,
          condominio:condominios(
            id,
            nome
          )
        )
      ),
      acordo:acordos(
        id,
        status,
        status_financeiro,
        valor_acordado,
        data_acordo,
        unidade:unidades(
          id,
          identificacao,
          responsavel_nome,
          telefone,
          email,
          condominio:condominios(
            id,
            nome
          )
        )
      ),
      mensagem:mensagens!lote_itens_mensagem_id_fkey(
        id,
        canal,
        status,
        status_operacional,
        destinatario,
        conteudo,
        conteudo_renderizado,
        template_id,
        erro,
        erro_envio,
        created_at,
        anexos:mensagem_anexos(
          id,
          ordem,
          documento:documentos_gerados(
            id,
            tipo,
            nome_arquivo
          )
        ),
        template:mensagens_templates(
          id,
          nome,
          assunto
        )
      )
    `)
    .eq('lote_id', id)
    .order('created_at', { ascending: false })
    .limit(LOTE_ITEM_DETAIL_LIMIT)

  if (itensError) {
    throw new Error(`Erro ao carregar itens do lote: ${itensError.message}`)
  }

  return {
    lote,
    itens: itens ?? [],
    totalItens: totalItens ?? 0,
    itemLimit: LOTE_ITEM_DETAIL_LIMIT,
    itensTruncados: (totalItens ?? 0) > LOTE_ITEM_DETAIL_LIMIT,
    hasEmailAprovado: Boolean((emailAprovado ?? []).length),
  }
}

export function countItensByStatus(itens: Array<{ status?: string | null }>) {
  return itens.reduce<Record<string, number>>((acc, item) => {
    const status = item.status || 'sem_status'
    acc[status] = (acc[status] || 0) + 1
    return acc
  }, {})
}

export async function listTemplatesParaLote(scope: CarteiraScope, carteiraId?: string | null) {
  const supabase = await createClient()

  let query = supabase
    .from('mensagens_templates')
    .select('id, nome, tipo, tipo_regua, categoria, intensidade, canal, assunto, ativo, carteira_id, prioridade')
    .eq('ativo', true)
    .order('nome', { ascending: true })

  if (carteiraId) {
    query = query.or(`carteira_id.is.null,carteira_id.eq.${carteiraId}`)
  } else if (scope.carteiraIds === null) {
    // admin sem carteira selecionada: templates globais e específicos aparecem
  } else if (scope.carteiraIds.length === 0) {
    query = query.is('carteira_id', null)
  } else {
    query = query.or(`carteira_id.is.null,carteira_id.in.(${scope.carteiraIds.join(',')})`)
  }

  const { data, error } = await query

  if (error) {
    console.error('Erro ao carregar templates para revisão do lote:', error.message || error)
    return []
  }

  return data ?? []
}
