'use server'

import { requireRole } from '@/utils/auth/require-role'
import { getPermittedCarteiras } from '@/utils/auth/get-permitted-carteiras'
import { getFlowCobrancaPageData } from './queries'

export async function carregarSelecaoFlows(canal: string, query: string) {
  await requireRole(['admin', 'gestor', 'operador'])
  if (canal !== 'email' && canal !== 'whatsapp') throw new Error('Canal inválido.')
  const scope = await getPermittedCarteiras()
  const params = new URLSearchParams(query)
  const data = await getFlowCobrancaPageData(scope, {
    canal,
    carteiraId: params.get('carteira') ?? undefined,
    condominioId: params.get('condominio') ?? undefined,
    vencimentoDe: params.get('vencimento_de') ?? undefined,
    vencimentoAte: params.get('vencimento_ate') ?? undefined,
    inclusaoDe: params.get('inclusao_de') ?? undefined,
    inclusaoAte: params.get('inclusao_ate') ?? undefined,
  })
  return data.disponibilidade
}
