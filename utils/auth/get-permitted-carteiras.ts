import { createClient } from '@/utils/supabase/server'
import { requireUser } from './require-user'

export type CarteiraScope = {
  userId: string
  isAdmin: boolean
  perfil: string
  carteiraIds: string[] | null
}

export async function getPermittedCarteiras(): Promise<CarteiraScope> {
  const user = await requireUser()

  if (!user) throw new Error('Usuário não autenticado.')

  if (user.perfil === 'admin') {
    return {
      userId: user.id,
      isAdmin: true,
      perfil: user.perfil,
      carteiraIds: null,
    }
  }

  const supabase = await createClient()

  const { data, error } = await supabase
    .from('usuarios_carteiras')
    .select('carteira_id')
    .eq('user_id', user.id)

  if (error) {
    console.warn('[authorization]', { event: 'wallet_lookup_failed', userId: user.id })
    throw new Error('Não foi possível validar o acesso às carteiras.')
  }

  return {
    userId: user.id,
    isAdmin: false,
    perfil: user.perfil,
    carteiraIds: (data ?? []).map((item: { carteira_id: string }) => item.carteira_id),
  }
}
