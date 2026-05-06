import { ShieldAlert } from 'lucide-react'
import { PageHeader } from '@/components/ui/page-header'
import { Card } from '@/components/ui/card'
import { ButtonLink } from '@/components/ui/button'
import { requireUser } from '@/utils/auth/require-user'

export default async function ForbiddenPage() {
  const user = await requireUser()

  if (!user) throw new Error('Usuário não autenticado.')

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Acesso restrito"
        title="Você não tem permissão para acessar esta área"
        description="Seu perfil atual não libera este módulo. Peça a um administrador para ajustar seu perfil ou vínculo com a carteira."
      />

      <Card>
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-red-50 text-red-700">
            <ShieldAlert size={22} />
          </div>
          <div>
            <h2 className="text-lg font-medium text-slate-950">Perfil atual: {user.perfil}</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
              Para acessar áreas administrativas, o usuário precisa de perfil adequado. Para módulos operacionais, o acesso também depende dos vínculos de carteira.
            </p>
            <div className="mt-5">
              <ButtonLink href="/app">Voltar ao cockpit</ButtonLink>
            </div>
          </div>
        </div>
      </Card>
    </div>
  )
}
