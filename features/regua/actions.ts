'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/utils/supabase/admin'
import { getPermittedCarteiras } from '@/utils/auth/get-permitted-carteiras'
import { normalizeRelationsList } from '@/utils/supabase/normalize-relation'
import {
  diasDesdeVencimento,
  formatDateBR,
  formatMoneyBR,
  isCobrancaElegivelParaRegua,
  montarMensagem,
  selecionarEtapa,
} from './engine'
import { carregarEtapasDeReguaAdmin } from './queries'
import type { ReguaTom } from './types'

type LoteReguaResumo = {
  criadas: number
  puladas: number
}

async function processarLoteReguaCobranca(): Promise<LoteReguaResumo> {
  const scope = await getPermittedCarteiras()
  const supabase = createAdminClient()

  let query: any = supabase
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

  if (!scope.isAdmin && scope.carteiraIds?.length) {
    query = query.in('carteira_id', scope.carteiraIds)
  }

  const { data, error } = await query

  if (error) {
    throw new Error(`Erro ao buscar cobranças para régua: ${error.message}`)
  }

  const rows = normalizeRelationsList((data ?? []) as any[], ['condominios', 'unidades'])
  let criadas = 0
  let puladas = 0

  for (const row of rows as any[]) {
    const condominio = row.condominios
    const unidade = row.unidades
    const inicio = Number(condominio?.inicio_cobranca_dias ?? 30)

    const elegivel = isCobrancaElegivelParaRegua({
      vencimento: row.vencimento,
      inicioCobrancaDias: inicio,
    })

    if (!elegivel) {
      puladas += 1
      continue
    }

    const etapas = await carregarEtapasDeReguaAdmin(condominio?.regua_cobranca_id)
    const diasAtraso = diasDesdeVencimento(row.vencimento)
    const etapa =
      selecionarEtapa({
        etapas,
        diasAtraso,
        inicioCobrancaDias: inicio,
      }) ?? etapas[0]

    const intensidade = (condominio?.intensidade_regua ?? etapa?.tom ?? 'medio') as ReguaTom

    const contexto = {
      responsavel: unidade?.responsavel_nome ?? 'responsável',
      unidade: unidade?.identificacao ?? 'unidade',
      condominio: condominio?.nome ?? 'condomínio',
      competencia: row.competencia ?? '',
      vencimento: formatDateBR(row.vencimento),
      valor: formatMoneyBR(row.valor_atualizado),
    }

    const mensagem = montarMensagem({
      tipo: 'cobranca',
      etapa,
      intensidade,
      contexto,
    })

    const canal = etapa?.canal ?? 'whatsapp'
    const destinatario = canal === 'email' ? unidade?.email : unidade?.telefone
    const reguaEtapaId = etapa?.id?.startsWith('default-') ? null : etapa?.id ?? null

    if (!destinatario) {
      puladas += 1

      await supabase.from('regua_execucoes').insert({
        carteira_id: row.carteira_id,
        cobranca_id: row.id,
        regua_etapa_id: reguaEtapaId,
        tipo: 'cobranca',
        canal,
        status: 'pulado',
        erro_msg: 'Responsável sem destinatário para o canal selecionado.',
        payload: {
          mensagem,
          destinatario,
          contexto,
          etapa_default_id: etapa?.id,
        },
      } as any)

      continue
    }

    const { error: execError } = await supabase.from('regua_execucoes').insert({
      carteira_id: row.carteira_id,
      cobranca_id: row.id,
      regua_etapa_id: reguaEtapaId,
      tipo: 'cobranca',
      canal,
      status: 'pendente',
      payload: {
        mensagem,
        destinatario,
        contexto,
        etapa_default_id: etapa?.id,
      },
    } as any)

    if (execError) {
      puladas += 1
      continue
    }

    const { error: mensagemError } = await supabase.from('mensagens').insert({
      carteira_id: row.carteira_id,
      contexto: 'regua_cobranca',
      canal,
      destinatario,
      conteudo: mensagem,
      status: 'pendente',
      scheduled_at: new Date().toISOString(),
    } as any)

    if (mensagemError) {
      puladas += 1
      continue
    }

    criadas += 1
  }

  return { criadas, puladas }
}

export async function gerarLoteReguaCobranca(_formData: FormData): Promise<void> {
  const resultado = await processarLoteReguaCobranca()

  console.log('Lote de régua de cobrança gerado:', resultado)

  revalidatePath('/app/mensageria')
}
