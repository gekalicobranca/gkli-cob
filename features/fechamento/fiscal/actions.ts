'use server'

import { revalidatePath } from 'next/cache'
import { requireGestor } from '@/utils/auth/require-gestor'
import { createClient } from '@/utils/supabase/server'
import { sendFiscalPeriod, type FiscalRunResult } from './service'

export async function processFiscalQueue(_previous: FiscalRunResult | null, form: FormData): Promise<FiscalRunResult> {
  await requireGestor()
  const id = String(form.get('periodo_id') ?? '')
  if (!/^[0-9a-f-]{36}$/i.test(id)) return { enviados: 0, erros: 0, mensagem: 'Fechamento inválido.' }
  const result = await sendFiscalPeriod(await createClient(), id)
  revalidatePath(`/app/gestao/fechamento/${id}`)
  return result
}
