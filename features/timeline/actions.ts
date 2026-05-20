'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/utils/supabase/server'
import { requireUser } from '@/utils/auth/require-user'
import { registrarEventoOperacional } from '@/features/operacional/service'
import type { EntidadeOperacional } from '@/features/operacional/types'

export async function registrarEventoTimelineManual(formData: FormData) {
  const user = await requireUser()
  if (!user) throw new Error('Usuário não autenticado.')
  const supabase = await createClient()

  const entidadeTipo = String(formData.get('entidade_tipo') ?? 'operacional') as EntidadeOperacional
  const entidadeId = String(formData.get('entidade_id') ?? '')
  const eventoCodigo = String(formData.get('evento_tipo') ?? 'timeline.evento_manual')
  const titulo = String(formData.get('titulo') ?? '').trim()
  const descricao = String(formData.get('descricao') ?? '').trim()
  const carteiraId = String(formData.get('carteira_id') ?? '').trim() || null

  if (!titulo) {
    throw new Error('Informe o título do evento.')
  }

  if (!entidadeId) {
    throw new Error('Informe o ID da entidade vinculada ao evento.')
  }

  await registrarEventoOperacional(supabase, {
    carteiraId,
    entidadeTipo,
    entidadeId,
    eventoCodigo,
    titulo,
    descricao: descricao || null,
    severidade: 'info',
    userId: user.id,
    payload: {
      origem_manual: true,
      usuario_email: user.email,
      usuario_nome: user.nome,
    },
    required: true,
  })

  revalidatePath('/app/timeline')
}
