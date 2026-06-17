'use server'

import { revalidatePath } from 'next/cache'
import { getPermittedCarteiras } from '@/utils/auth/get-permitted-carteiras'
import { processarReguaCobranca } from './services/processar-regua-cobranca'
import { processarReguaAcordos } from './services/processar-regua-acordos'

function getFiltro(formData?: FormData, key?: string) {
  if (!formData || !key) return ''
  return String(formData.get(key) ?? '').trim()
}

function getFiltrosRegua(formData?: FormData) {
  return {
    q: getFiltro(formData, 'q'),
    carteiraId: getFiltro(formData, 'carteira_id'),
    condominioId: getFiltro(formData, 'condominio_id'),
    contato: getFiltro(formData, 'contato') || 'todos',
  }
}

function getSelection(formData: FormData | undefined, key: string) {
  if (!formData || formData.get('selection_enabled') !== '1') return undefined
  return formData.getAll(key).map((value) => String(value).trim()).filter(Boolean)
}

export async function gerarLoteReguaCobranca(formData?: FormData): Promise<void> {
  const scope = await getPermittedCarteiras()
  const resultado = await processarReguaCobranca({
    scope,
    origem: 'manual',
    ...getFiltrosRegua(formData),
    cobrancaIds: getSelection(formData, 'cobranca_ids'),
  })

  void resultado

  revalidatePath('/app/mensageria')
  revalidatePath('/app/lotes')
}


export async function gerarLoteReguaAcordos(formData?: FormData): Promise<void> {
  const scope = await getPermittedCarteiras()
  const resultado = await processarReguaAcordos({
    scope,
    origem: 'manual',
    ...getFiltrosRegua(formData),
    parcelaIds: getSelection(formData, 'parcela_ids'),
  })

  void resultado

  revalidatePath('/app/mensageria')
  revalidatePath('/app/lotes')
  revalidatePath('/app/regua-acordo')
}
