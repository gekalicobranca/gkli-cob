import { redirect } from 'next/navigation'
import { canalFlowCobranca, flowCobrancaPath } from '@/features/flows/cobranca/rotas'

export default async function FlowCobrancaRedirect({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = await searchParams
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (key === 'canal' || value === undefined) continue
    for (const item of Array.isArray(value) ? value : [value]) query.append(key, item)
  }
  const path = flowCobrancaPath(canalFlowCobranca(params.canal))
  redirect(query.size ? `${path}?${query}` : path)
}
