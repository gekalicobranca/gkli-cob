import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/utils/supabase/server'

function redirectTo(request: NextRequest, path: string, params?: Record<string, string>) {
  const url = new URL(path, request.url)
  Object.entries(params ?? {}).forEach(([key, value]) => url.searchParams.set(key, value))
  return NextResponse.redirect(url, { status: 303 })
}

export async function POST(request: NextRequest) {
  const formData = await request.formData()
  const password = String(formData.get('password') ?? '')
  const confirmPassword = String(formData.get('confirmPassword') ?? '')

  if (password.length < 8) {
    return redirectTo(request, '/redefinir-senha', {
      erro: 'A nova senha precisa ter pelo menos 8 caracteres.',
    })
  }

  if (password !== confirmPassword) {
    return redirectTo(request, '/redefinir-senha', {
      erro: 'As senhas informadas não conferem.',
    })
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return redirectTo(request, '/redefinir-senha', {
      erro: 'Link inválido ou expirado. Solicite uma nova recuperação de senha.',
    })
  }

  const { error } = await supabase.auth.updateUser({ password })

  if (error) {
    return redirectTo(request, '/redefinir-senha', {
      erro: 'Não foi possível atualizar a senha. Tente novamente.',
    })
  }

  await supabase.auth.signOut()

  return redirectTo(request, '/login', {
    sucesso: 'Senha atualizada com sucesso. Acesse novamente com sua nova senha.',
  })
}
