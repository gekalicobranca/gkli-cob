import { createClient } from '@/utils/supabase/server'
import { applyCarteiraScope } from '@/utils/auth/apply-carteira-scope'
import type { CarteiraScope } from '@/utils/auth/get-permitted-carteiras'

export async function listPreJuridicoCasos(scope: CarteiraScope) {
  const supabase = await createClient()
  let query = supabase
    .from('pre_juridico_casos')
    .select(`
      id, carteira_id, acordo_id, condominio_id, unidade_id, cobranca_id,
      responsavel_id, etapa, escritorio_juridico, prazo_etapa, protocolo_envio,
      numero_processo, tribunal, foro, observacoes, enviado_juridico_em,
      judicializado_em, created_at, updated_at,
      carteira:carteiras(nome),
      condominio:condominios(nome,nome_operacional,administradora),
      unidade:unidades(identificacao,bloco,responsavel_nome),
      acordo:acordos(valor_acordado,data_acordo,status,status_financeiro),
      responsavel:profiles(nome,email)
    `)
    .order('updated_at', { ascending: false })
    .limit(500)
  query = applyCarteiraScope(query, scope.carteiraIds)
  const { data, error } = await query
  if (error) throw new Error(`Erro ao carregar monitor pré-jurídico: ${error.message}`)
  return data ?? []
}
