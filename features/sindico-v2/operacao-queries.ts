import 'server-only'
import { createAdminClient } from '@/utils/supabase/admin'
import { somenteCobrancasCanonicas } from '@/lib/core/cobranca-arquivamento'
import type { FonteOperacao } from './operacao'

// Chamada somente depois da autorização do condomínio em carregarVisaoSindicoV2/Gestao.
export async function carregarFonteOperacao(condominioId: string): Promise<FonteOperacao> {
  const admin = createAdminClient()
  const unidade = 'unidades:unidade_id(identificacao,bloco)'
  async function paginar<T>(consulta: (inicio: number, fim: number) => PromiseLike<{ data: unknown[] | null; error: unknown }>): Promise<T[]> {
    const rows: T[] = []
    for (let inicio = 0; ; inicio += 500) {
      const { data, error } = await consulta(inicio, inicio + 499)
      if (error) throw error
      rows.push(...(data ?? []) as T[])
      if (!data || data.length < 500) return rows
    }
  }
  const resultados = await Promise.allSettled([
    paginar<FonteOperacao['cobrancas'][number]>((inicio, fim) => somenteCobrancasCanonicas(admin.from('cobrancas')
      .select(`id,condominio_id,unidade_id,created_at,valor_atualizado,valor_original,status,status_operacional,status_financeiro,vencimento,${unidade}`))
      .eq('condominio_id', condominioId).order('id').range(inicio, fim)),
    paginar<FonteOperacao['acordos'][number]>((inicio, fim) => admin.from('acordos')
      .select(`id,condominio_id,unidade_id,created_at,data_acordo,valor_acordado,quantidade_parcelas,status,exige_aprovacao_sindico,sindico_aprovado_em,${unidade}`)
      .eq('condominio_id', condominioId).order('data_acordo', { ascending: false }).order('id').range(inicio, fim)),
    paginar<FonteOperacao['parcelas'][number]>((inicio, fim) => admin.from('parcelas_acordo')
      .select('id,acordo_id,numero,valor,vencimento,status,data_pagamento,acordos!inner(condominio_id)')
      .eq('acordos.condominio_id', condominioId).order('id').range(inicio, fim)),
    paginar<FonteOperacao['pendencias'][number]>((inicio, fim) => admin.from('central_pendencias')
      .select('id,condominio_id,unidade_id,created_at,tipo,origem,status,prioridade,prazo_limite')
      .eq('condominio_id', condominioId).in('status', ['aberta', 'em_tratamento'])
      .order('prazo_limite', { ascending: true, nullsFirst: false }).order('id').range(inicio, fim)),
    paginar<FonteOperacao['procuracoes'][number]>((inicio, fim) => admin.from('pre_juridico_casos')
      .select(`id,condominio_id,unidade_id,created_at,procuracao_status,etapa,prazo_etapa,${unidade}`)
      .eq('condominio_id', condominioId).in('procuracao_status', ['gerada', 'enviada'])
      .order('id').range(inicio, fim)),
    paginar<{ id: string; identificacao: string | null; bloco: string | null }>((inicio, fim) => admin.from('unidades')
      .select('id,identificacao,bloco').eq('condominio_id', condominioId).order('id').range(inicio, fim)),
  ])
  const [cobrancas, acordos, parcelas, pendencias, procuracoes, unidades] = resultados
  const nomes = ['cobrancas', 'acordos', 'parcelas', 'pendencias', 'procuracoes', 'pendencias']
  const unidadesPorId = new Map((unidades.status === 'fulfilled' ? unidades.value : []).map((row) => [row.id, row]))
  return {
    cobrancas: cobrancas.status === 'fulfilled' ? cobrancas.value : [],
    acordos: acordos.status === 'fulfilled' ? acordos.value : [],
    parcelas: parcelas.status === 'fulfilled' ? parcelas.value : [],
    pendencias: pendencias.status === 'fulfilled' ? pendencias.value.map((row) => ({ ...row, unidades: unidadesPorId.get(row.unidade_id) ?? null })) : [],
    procuracoes: procuracoes.status === 'fulfilled' ? procuracoes.value : [],
    erros: resultados.flatMap((result, index) => result.status === 'rejected' ? [nomes[index]] : []),
  }
}
