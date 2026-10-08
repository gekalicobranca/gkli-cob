import { createAdminClient } from '@/utils/supabase/admin'
import { applyCarteiraScope } from '@/utils/auth/apply-carteira-scope'
import type { CarteiraScope } from '@/utils/auth/get-permitted-carteiras'
import { lerCasoPayload, type KeilaCasoPayload } from './casos'
import { AGENTES_VIRTUAIS, escopoLidia, type AgenteVirtualId } from '../agentes-virtuais/perfis'

export type KeilaCaso = {
  id: string; titulo: string; status: string; updated_at: string; condominio_id: string; payload: KeilaCasoPayload
  condominio: { nome: string; operacao_virtual_habilitada: boolean; despesas_acordo_avista_percentual: number | null; despesas_acordo_parcelado_percentual: number | null; parcelas_acordo_sem_aprovacao_sindico: number | null } | null
}

export async function getKeilaCasos(scope: CarteiraScope, casoId?: string, condominioId?: string, agenteId: AgenteVirtualId = 'keila') {
  const tipoCaso = AGENTES_VIRTUAIS[agenteId].tipoCaso
  if (agenteId === 'lidia') {
    scope = { ...scope, carteiraIds: escopoLidia(scope.carteiraIds) }
    if (!scope.carteiraIds?.length) throw new Error('Sem acesso à carteira Genske Advogados.')
    if (condominioId && condominioId !== AGENTES_VIRTUAIS.lidia.pilotoCondominioId) throw new Error('Condomínio fora do piloto da Lidia.')
  }
  const supabase = createAdminClient()
  const selection = 'id,titulo,status,updated_at,condominio_id,payload'
  const { data, error } = await applyCarteiraScope(supabase.from('central_pendencias').select(selection)
    .eq('tipo', tipoCaso).order('updated_at', { ascending: false }).limit(200), scope.carteiraIds)
  if (error) throw new Error(`Erro ao carregar atendimentos de ${AGENTES_VIRTUAIS[agenteId].nome}: ${error.message}`)
  let rows = data ?? []
  if (casoId && !rows.some((row: { id: string }) => row.id === casoId)) {
    const { data: detalhe, error: detalheError } = await applyCarteiraScope(supabase.from('central_pendencias').select(selection)
      .eq('tipo', tipoCaso).eq('id', casoId), scope.carteiraIds).maybeSingle()
    if (detalheError) throw new Error(detalheError.message)
    if (detalhe) rows = [...rows, detalhe]
  }
  const casos: KeilaCaso[] = rows.map((row: any) => {
    const payload = lerCasoPayload(row.payload)
    if (!payload) return null
    return { ...row, condominio: null,
      payload: { ...payload, ...(['resolvida', 'cancelada'].includes(row.status) ? { estado: 'concluido' as const } : {}) },
    } as KeilaCaso
  }).filter((row: KeilaCaso | null): row is KeilaCaso => row !== null && (agenteId !== 'lidia' || row.condominio_id === AGENTES_VIRTUAIS.lidia.pilotoCondominioId))
  const unidadeIds = [...new Set(casos.flatMap(c => c.payload.unidade_ids))]
  const execucaoIds = [...new Set(casos.map(c => c.payload.execucao_id).filter(Boolean))]
  const [unidadesResult, execucoesResult, condominiosResult] = await Promise.all([
    condominioId ? applyCarteiraScope(supabase.from('unidades').select('id,condominio_id,identificacao,bloco').eq('condominio_id', condominioId).order('identificacao'), scope.carteiraIds)
      : unidadeIds.length ? applyCarteiraScope(supabase.from('unidades').select('id,condominio_id,identificacao,bloco').in('id', unidadeIds), scope.carteiraIds) : { data: [], error: null },
    execucaoIds.length ? applyCarteiraScope(supabase.from('agente_execucoes').select('id,status,finalizado_em,erro_mensagem,arquivos:agente_arquivos(id,nome_arquivo,status_validacao)').in('id', execucaoIds), scope.carteiraIds) : { data: [], error: null },
    applyCarteiraScope(supabase.from('condominios').select('id,nome,operacao_virtual_habilitada,despesas_acordo_avista_percentual,despesas_acordo_parcelado_percentual,parcelas_acordo_sem_aprovacao_sindico').eq('status', 'ativo').order('nome'), scope.carteiraIds),
  ])
  for (const result of [unidadesResult, execucoesResult, condominiosResult]) if (result.error) throw new Error(result.error.message)
  const condominios = new Map((condominiosResult.data ?? []).map((c: any) => [c.id, c]))
  for (const caso of casos) caso.condominio = condominios.get(caso.condominio_id) as KeilaCaso['condominio'] ?? null
  return { casos, unidades: unidadesResult.data ?? [], execucoes: execucoesResult.data ?? [], condominios: (condominiosResult.data ?? []).filter((c: any) => agenteId !== 'lidia' || c.id === AGENTES_VIRTUAIS.lidia.pilotoCondominioId) }
}
