'use server'

import { iniciarTratamentoPendencia, resolverPendencia } from '@/features/pendencias/actions'

export async function tratarPendenciaJudicial(formData: FormData) {
  return iniciarTratamentoPendencia(null, formData)
}

export async function resolverPendenciaJudicial(formData: FormData) {
  return resolverPendencia(null, formData)
}
