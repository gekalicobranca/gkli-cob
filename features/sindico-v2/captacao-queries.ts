import { createAdminClient } from '@/utils/supabase/admin'
import { listCondominios } from '@/features/condominios/queries'
import { getPermittedCarteiras } from '@/utils/auth/get-permitted-carteiras'
import { carregarAcessoSindicoV2 } from './queries'
import {
  montarCaptacaoComHistorico,
  type CaptacaoSindico,
  type RegistroCaptacao,
  type RegistroCaptacaoHistorica,
} from './captacao'
import type { PeriodoSindico } from './periodos'

type AcessoVisaoSindicoV2 = {
  nome: string
  condominios: { id: string; nome: string }[]
  selecionado: { id: string; nome: string } | null
  selecaoInvalida: boolean
}

export async function carregarVisaoSindicoV2(condominioId: string | undefined, periodo: PeriodoSindico) {
  // Resolver autorização aqui, antes de criar qualquer consulta de dados do condomínio.
  const acesso = await carregarAcessoSindicoV2(condominioId)
  return carregarCaptacaoParaAcesso(acesso, periodo)
}

export async function carregarVisaoSindicoV2Gestao(condominioId: string | undefined, periodo: PeriodoSindico) {
  const scope = await getPermittedCarteiras()
  const rows = await listCondominios(scope, { status: 'ativo' }, { all: true })
  const condominios = rows
    .map((item: any) => ({ id: String(item.id), nome: String(item.nome_operacional || item.nome || 'Condomínio sem nome') }))
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
  const selecionado = condominioId
    ? condominios.find((item) => item.id === condominioId) ?? null
    : condominios[0] ?? null

  return carregarCaptacaoParaAcesso({
    nome: 'Gestão GKLI',
    condominios,
    selecionado,
    selecaoInvalida: Boolean(condominioId && !condominios.some((item) => item.id === condominioId)),
  }, periodo)
}

async function carregarCaptacaoParaAcesso(acesso: AcessoVisaoSindicoV2, periodo: PeriodoSindico) {
  if (!acesso.selecionado) return { acesso, captacao: null }
  const admin = createAdminClient()
  const registros: RegistroCaptacao[] = []
  const historicos: RegistroCaptacaoHistorica[] = []
  try {
    for (let offset = 0; ; offset += 200) {
      const { data, error } = await admin.from('conversoes_relatorio').select(`
        id,condominio_id,status,criado_em,atualizado_em,
        gerado_em:preview_json->rankingMensal->>geradoEm,
        total_unidades:preview_json->rankingMensal->totalUnidades,
        valor_total_ranking:preview_json->rankingMensal->valorTotal,
        unidades_ranking:preview_json->rankingMensal->unidades
      `).eq('condominio_id', acesso.selecionado.id)
        .in('status', ['concluido', 'concluido_com_alertas']).order('id').range(offset, offset + 199)
      if (error) throw error
      registros.push(...(data ?? []) as unknown as RegistroCaptacao[])
      if (!data || data.length < 200) break
    }
    for (let offset = 0; ; offset += 500) {
      const { data, error } = await admin.from('captacao_historica_sindico').select(`
        id,condominio_id,unidade_id,competencia,referencia_em,data_entrada,valor,
        debito_descricao,debito_inicial,debito_final,situacao,unidade_identificacao,bloco
      `).eq('condominio_id', acesso.selecionado.id)
        .in('competencia', periodo.competencias)
        .eq('uso_sistema', 'liberada')
        .order('data_entrada', { ascending: true })
        .order('id', { ascending: true })
        .range(offset, offset + 499)
      if (error) throw error
      historicos.push(...(data ?? []) as unknown as RegistroCaptacaoHistorica[])
      if (!data || data.length < 500) break
    }
    // Só o objeto sanitizado sai do servidor: não inclui nomes de devedores, contatos ou arquivos.
    return { acesso, captacao: montarCaptacaoComHistorico(registros, historicos, acesso.selecionado.id, periodo) }
  } catch {
    return { acesso, captacao: { estado: 'erro', ciclos: [], ciclosDisponiveis: 0 } as CaptacaoSindico }
  }
}
