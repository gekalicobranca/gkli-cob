'use client'

import { type ChangeEvent, type FormEvent, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/utils/supabase/client'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { GKLI_APP } from '@/lib/gkli-theme'

export default function LoginPage() {
  const router = useRouter()
  const supabase = createClient()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setLoading(true)
    setError(null)

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (error) {
      setError('E-mail ou senha inválidos.')
      setLoading(false)
      return
    }

    router.replace('/app')
    router.refresh()
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#F6F8F7] px-6">
      <Card className="w-full max-w-md p-8 shadow-[0_24px_80px_rgba(15,23,42,0.08)]">
        <div>
          <img
            src={GKLI_APP.logo}
            alt="GKLI Tecnologia Aplicada"
            className="h-12 w-48 object-contain object-left"
          />

          <p className="mt-5 text-[11px] font-medium uppercase tracking-[0.18em] text-[var(--gkli-primary)]">
            {GKLI_APP.name}
          </p>

          <h1 className="mt-3 text-3xl font-medium tracking-[-0.025em] text-slate-950">
            Entrar na plataforma
          </h1>

          <p className="mt-2 text-sm leading-6 text-slate-600">
            Acesse o cockpit operacional de cobrança.
          </p>
        </div>

        <form onSubmit={handleLogin} className="mt-8 space-y-4">
          <div>
            <label className="text-[13px] font-medium text-slate-700">E-mail</label>
            <Input
              type="email"
              required
              value={email}
              onChange={(event: ChangeEvent<HTMLInputElement>) => setEmail(event.target.value)}
              className="mt-2"
              placeholder="seu@email.com"
            />
          </div>

          <div>
            <label className="text-[13px] font-medium text-slate-700">Senha</label>
            <Input
              type="password"
              required
              value={password}
              onChange={(event: ChangeEvent<HTMLInputElement>) => setPassword(event.target.value)}
              className="mt-2"
              placeholder="••••••••"
            />
          </div>

          {error ? (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
              {error}
            </div>
          ) : null}

          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? 'Entrando...' : 'Entrar'}
          </Button>
        </form>
      </Card>
    </main>
  )
}
