'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { normalizeName } from '@/utils/formatters/normalize'
import { requireAdmin } from '@/utils/auth/require-admin'

export async function createCarteira(formData: FormData) {
  await requireAdmin()

  const nome = String(formData.get('nome') ?? '').trim()
  const descricao = String(formData.get('descricao') ?? '').trim()
  const logoUrl = String(formData.get('logo_url') ?? '').trim()

  if (nome.length < 2) {
    throw new Error('Nome da carteira obrigatório.')
  }

  const supabase = await createClient()

  const { error } = await supabase.from('carteiras').insert({
    nome,
    nome_normalizado: normalizeName(nome),
    descricao: descricao || null,
    logo_url: logoUrl || null,
    ativo: true,
  })

  if (error) {
    throw new Error(`Erro ao criar carteira: ${error.message}`)
  }

  revalidatePath('/app/carteiras-usuarios')
  redirect('/app/carteiras-usuarios')
}

export async function createUsuario(formData: FormData) {
  await requireAdmin()

  const nome = String(formData.get('nome') ?? '').trim()
  const email = String(formData.get('email') ?? '').trim().toLowerCase()
  const password = String(formData.get('password') ?? '')
  const role = String(formData.get('role') ?? 'operador')
  const carteiraId = String(formData.get('carteira_id') ?? '')

  if (nome.length < 2) {
    throw new Error('Nome do usuário obrigatório.')
  }

  if (!email || !email.includes('@')) {
    throw new Error('E-mail inválido.')
  }

  if (password.length < 6) {
    throw new Error('A senha deve ter pelo menos 6 caracteres.')
  }

  if (!['admin', 'gestor', 'operador', 'leitura'].includes(role)) {
    throw new Error('Perfil inválido.')
  }

  const admin = createAdminClient()

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      nome,
      role,
    },
  })

  if (createError) {
    throw new Error(`Erro ao criar usuário no Auth: ${createError.message}`)
  }

  const userId = created.user?.id

  if (!userId) {
    throw new Error('Usuário criado sem ID retornado pelo Supabase Auth.')
  }

  const { error: profileError } = await admin
    .from('profiles')
    .upsert(
      {
        id: userId,
        email,
        nome,
        role,
      },
      {
        onConflict: 'id',
      }
    )

  if (profileError) {
    throw new Error(`Erro ao criar profile: ${profileError.message}`)
  }

  if (carteiraId) {
    const { error: vinculoError } = await admin
      .from('usuarios_carteiras')
      .upsert(
        {
          user_id: userId,
          carteira_id: carteiraId,
        },
        {
          onConflict: 'user_id,carteira_id',
        }
      )

    if (vinculoError) {
      throw new Error(`Usuário criado, mas houve erro ao vincular carteira: ${vinculoError.message}`)
    }
  }

  revalidatePath('/app/carteiras-usuarios')
  redirect('/app/carteiras-usuarios')
}

export async function updateUserRole(formData: FormData) {
  await requireAdmin()

  const userId = String(formData.get('user_id') ?? '')
  const role = String(formData.get('role') ?? '')

  if (!userId) {
    throw new Error('Usuário obrigatório.')
  }

  if (!['admin', 'gestor', 'operador', 'leitura'].includes(role)) {
    throw new Error('Perfil inválido.')
  }

  const supabase = await createClient()

  const { error } = await supabase
    .from('profiles')
    .update({ role })
    .eq('id', userId)

  if (error) {
    throw new Error(`Erro ao atualizar perfil: ${error.message}`)
  }

  revalidatePath('/app/carteiras-usuarios')
  redirect('/app/carteiras-usuarios')
}

export async function createUsuarioCarteira(formData: FormData) {
  await requireAdmin()

  const userId = String(formData.get('user_id') ?? '')
  const carteiraId = String(formData.get('carteira_id') ?? '')

  if (!userId) {
    throw new Error('Usuário obrigatório.')
  }

  if (!carteiraId) {
    throw new Error('Carteira obrigatória.')
  }

  const supabase = await createClient()

  const { error } = await supabase
    .from('usuarios_carteiras')
    .upsert(
      {
        user_id: userId,
        carteira_id: carteiraId,
      },
      {
        onConflict: 'user_id,carteira_id',
      }
    )

  if (error) {
    throw new Error(`Erro ao vincular usuário à carteira: ${error.message}`)
  }

  revalidatePath('/app/carteiras-usuarios')
  redirect('/app/carteiras-usuarios')
}

export async function removeUsuarioCarteira(formData: FormData) {
  await requireAdmin()

  const userId = String(formData.get('user_id') ?? '')
  const carteiraId = String(formData.get('carteira_id') ?? '')

  if (!userId || !carteiraId) {
    throw new Error('Usuário e carteira são obrigatórios.')
  }

  const supabase = await createClient()

  const { error } = await supabase
    .from('usuarios_carteiras')
    .delete()
    .eq('user_id', userId)
    .eq('carteira_id', carteiraId)

  if (error) {
    throw new Error(`Erro ao remover vínculo: ${error.message}`)
  }

  revalidatePath('/app/carteiras-usuarios')
}
