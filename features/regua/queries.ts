import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'
import type { CarteiraScope } from '@/utils/auth/get-permitted-carteiras'
import { applyCarteiraScope } from '@/utils/auth/apply-carteira-scope'
import { normalizeRelationsList } from '@/utils/supabase/normalize-relation'
import { diasDesdeVencimento, formatDateBR, formatMoneyBR, isCobrancaElegivelParaRegua, montarMensagem, selecionarEtapa } from './engine'
import type { ReguaEtapa, ReguaTom } from './types'

const DEFAULT_COBRANCA_ETAPAS: ReguaEtapa[] = [
  { id: 'default-cob-1', regua_id: 'default-cobranca', ordem: 1, delay_dias: 0, canal: 'whatsapp', tom: 'leve', template: 'Olá, {{responsavel}}. Identificamos um débito em aberto da unidade {{unidade}} no {{condominio}}, competência {{competencia}}, vencido em {{vencimento}}. Podemos auxiliar na regularização?' },
  { id: 'default-cob-2', regua_id: 'default-cobranca', ordem: 2, delay_dias: 3, canal: 'whatsapp', tom: 'medio', template: 'Olá, {{responsavel}}. Consta pendência da unidade {{unidade}} no {{condominio}}, valor atualizado {{valor}}. Podemos seguir com a regularização?' },
  { id: 'default-cob-3', regua_id: 'default-cobranca', ordem: 3, delay_dias: 7, canal: 'whatsapp', tom: 'medio', template: 'Olá, {{responsavel}}. O débito da unidade {{unidade}} segue pendente. Regularize para evitar avanço da cobrança.' },
  { id: 'default-cob-4', regua_id: 'default-cobranca', ordem: 4, delay_dias: 15, canal: 'whatsapp', tom: 'agressivo', template: 'Olá, {{responsavel}}. O débito da unidade {{unidade}} no {{condominio}} segue em aberto e poderá ser encaminhado para medidas jurídicas.' },
]

export async function listReguaCobrancaPreview(scope: CarteiraScope) {
  const supabase = await createClient()

  let query = supabase
    .from('cobrancas')
    .select(`
      id,
      carteira_id,
      competencia,
      vencimento,
      valor_atualizado,
      status,
      condominios(id, nome, inicio_cobranca_dias, intensidade_regua, regua_cobranca_id),
      unidades(id, identificacao, responsavel_nome, telefone, email)
    `)
    .in('status', ['novo', 'em cobrança ativa', 'em negociação'])
    .order('vencimento', { ascending: true })

  query = applyCarteiraScope(query, scope.carteiraIds)

  const { data, error } = await query

  if (error) {
    throw new Error(`Erro ao carregar prévia da régua: ${error.message}`)
  }

  return normalizeRelationsList((data ?? []) as any[], ['condominios', 'unidades'])
    .map((row: any) => {
      const condominio = row.condominios
      const unidade = row.unidades
      const inicio = Number(condominio?.inicio_cobranca_dias ?? 30)
      const diasAtraso = diasDesdeVencimento(row.vencimento)
      const elegivel = isCobrancaElegivelParaRegua({ vencimento: row.vencimento, inicioCobrancaDias: inicio })
      const etapa = selecionarEtapa({ etapas: DEFAULT_COBRANCA_ETAPAS, diasAtraso, inicioCobrancaDias: inicio }) ?? DEFAULT_COBRANCA_ETAPAS[0]
      const intensidade = (condominio?.intensidade_regua ?? etapa.tom ?? 'medio') as ReguaTom
      const contexto = {
        responsavel: unidade?.responsavel_nome ?? 'responsável',
        unidade: unidade?.identificacao ?? 'unidade',
        condominio: condominio?.nome ?? 'condomínio',
        competencia: row.competencia ?? '',
        vencimento: formatDateBR(row.vencimento),
        valor: formatMoneyBR(row.valor_atualizado),
      }

      return {
        ...row,
        inicio_cobranca_dias: inicio,
        dias_atraso: diasAtraso,
        elegivel,
        etapa,
        intensidade,
        mensagem_preview: montarMensagem({ tipo: 'cobranca', etapa, intensidade, contexto }),
        destinatario_preview: unidade?.telefone || unidade?.email || '',
      }
    })
}

export async function carregarEtapasDeReguaAdmin(reguaId?: string | null) {
  if (!reguaId) return DEFAULT_COBRANCA_ETAPAS
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('regua_etapas')
    .select('id, regua_id, ordem, delay_dias, canal, template, tom, ativo')
    .eq('regua_id', reguaId)
    .eq('ativo', true)
    .order('ordem', { ascending: true })

  if (error || !data?.length) return DEFAULT_COBRANCA_ETAPAS
  return data as ReguaEtapa[]
}
