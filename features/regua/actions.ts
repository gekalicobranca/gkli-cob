'use server'

import { revalidatePath } from 'next/cache'
import { getPermittedCarteiras } from '@/utils/auth/get-permitted-carteiras'
import { processarReguaCobranca } from './services/processar-regua-cobranca'
import { processarReguaAcordos } from './services/processar-regua-acordos'

export async function gerarLoteReguaCobranca(_formData: FormData): Promise<void> {
  const scope = await getPermittedCarteiras()
  const resultado = await processarReguaCobranca({ scope, origem: 'manual' })

  void resultado

  revalidatePath('/app/mensageria')
  revalidatePath('/app/lotes')
}


export async function gerarLoteReguaAcordos(_formData: FormData): Promise<void> {
  const scope = await getPermittedCarteiras()
  const resultado = await processarReguaAcordos({ scope, origem: 'manual' })

  void resultado

  revalidatePath('/app/mensageria')
  revalidatePath('/app/lotes')
  revalidatePath('/app/regua-acordo')
}
