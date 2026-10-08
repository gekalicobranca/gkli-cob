import type { SupabaseClient } from '@supabase/supabase-js'
import { AGENTES_VIRTUAIS, type AgenteVirtualId } from '../agentes-virtuais/perfis'
import { carregarCaso, salvarCaso } from './casos-service'
import { multaPorInfracao } from './natureza-cobranca'
import { montarPropostaKeila } from './acordos'
import { somenteCobrancasCanonicas } from '../../lib/core/cobranca-arquivamento'

export async function proporAcordoKeila(db: SupabaseClient, input: {
  casoId: string; unidadeId: string; parcelas: number; vencimento: string; carteiraIds: string[] | null; agenteId?: AgenteVirtualId
}) {
  const agenteId = input.agenteId ?? 'keila'
  const caso = await carregarCaso(db, input.casoId, input.carteiraIds, agenteId)
  if (!caso.payload.unidade_ids.includes(input.unidadeId)) throw new Error('Unidade fora do atendimento.')
  const { data: condominio, error } = await db.from('condominios').select('inicio_cobranca_dias,dias_apos_vencimento_regua,bloqueio_garantidora_habilitado,bloqueio_garantidora_inicio,bloqueio_garantidora_fim,despesas_acordo_avista_percentual,despesas_acordo_parcelado_percentual,parcelas_acordo_sem_aprovacao_sindico')
    .eq('id', caso.condominio_id).single()
  if (error) throw error
  const { data: cobrancas, error: erro } = await somenteCobrancasCanonicas(db.from('cobrancas')
    .select('id,vencimento,valor_atualizado,status,status_operacional,status_financeiro,observacoes')
    .eq('unidade_id', input.unidadeId).eq('condominio_id', caso.condominio_id)).order('id')
  if (erro) throw erro
  const multas = (cobrancas ?? []).filter(multaPorInfracao)
  if (multas.length) {
    const proxima = 'Avaliar com a equipe humana a cobrança de multas por infração. Não apresentar proposta automática para esses débitos.'
    await salvarCaso(db, caso, { ...caso.payload, estado: 'atendimento_humano', proxima_acao: proxima,
      resposta_simulada: null,
      atividades: [...caso.payload.atividades, { em: new Date().toISOString(), usuario_id: null,
        descricao: `Proposta automática suspensa: multas por infração identificadas (${multas.map(c => c.id).join(', ')}). ${proxima}` }] }, null)
    throw new Error('Multa por infração identificada. Caso encaminhado para avaliação humana; nenhuma proposta criada.')
  }
  const elegiveis = (cobrancas ?? []).filter(c => !(condominio.bloqueio_garantidora_habilitado && c.vencimento >= condominio.bloqueio_garantidora_inicio && c.vencimento <= condominio.bloqueio_garantidora_fim))
  const proposta = montarPropostaKeila(elegiveis, Number(condominio.dias_apos_vencimento_regua ?? condominio.inicio_cobranca_dias ?? 30), input.parcelas, input.vencimento, new Date(), condominio)
  const resultado = await db.rpc(AGENTES_VIRTUAIS[agenteId].negociarRpc, { p_caso: caso.id, p_unidade: input.unidadeId,
    p_operacao: 'propor', p_dados: proposta, p_evidencia: 'Proposta preparada pelo operador com os valores disponíveis no cadastro.' })
  if (resultado.error) throw resultado.error
  return resultado.data
}

export async function aceitarAcordoKeila(db: SupabaseClient, input: { casoId: string; unidadeId: string; evidencia: string; agenteId?: AgenteVirtualId }) {
  const agenteId = input.agenteId ?? 'keila'
  const caso = await carregarCaso(db, input.casoId, null, agenteId)
  if (!caso.payload.unidade_ids.includes(input.unidadeId)) throw new Error('Unidade fora do atendimento.')
  if (!input.evidencia.trim()) throw new Error('Registre a resposta de aceite real recebida.')
  const resultado = await db.rpc(AGENTES_VIRTUAIS[agenteId].negociarRpc, { p_caso: input.casoId, p_unidade: input.unidadeId,
    p_operacao: 'aceitar', p_dados: {}, p_evidencia: input.evidencia.trim() })
  if (resultado.error) throw resultado.error
  return resultado.data
}
