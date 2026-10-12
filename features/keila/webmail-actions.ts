'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { requireRole } from '@/utils/auth/require-role'
import { getPermittedCarteiras } from '@/utils/auth/get-permitted-carteiras'
import { createAdminClient } from '@/utils/supabase/admin'
import { registrarRetornoWebmail } from './webmail'

export async function registrarWebmailKeila(form: FormData) {
  await requireRole(['admin', 'gestor', 'operador'])
  const scope = await getPermittedCarteiras()
  let caso = '', erro = ''
  try {
    caso = await registrarRetornoWebmail(createAdminClient(), scope.carteiraIds, {
      mensagemId: String(form.get('mensagem_id') ?? ''),
      recebidoEm: `${String(form.get('recebido_em') ?? '')}:00-03:00`,
      conteudo: String(form.get('conteudo') ?? ''), link: String(form.get('webmail_url') ?? ''),
    })
  } catch (e) { erro = e instanceof Error ? e.message : 'Não foi possível registrar o retorno.' }
  revalidatePath('/app/gestao/keila')
  revalidatePath('/app/pendencias')
  redirect(`/app/gestao/keila?${new URLSearchParams(erro ? { tab: 'webmail', erro } : { caso, resultado: 'Retorno do webmail encaminhado à Keila. Nenhuma resposta enviada.' })}`)
}
