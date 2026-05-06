import { Settings } from 'lucide-react'
import { PageHeader } from '@/components/ui/page-header'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { requireAdmin } from '@/utils/auth/require-admin'

export default async function AdministrativoPage() {
  await requireAdmin()

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Gestão"
        title="Administrativo"
        description="Parâmetros técnicos, usuários, perfis e ajustes sensíveis do sistema."
        actions={<Button><Settings size={16} />Configurar</Button>}
      />

      <Card className="relative overflow-hidden p-6">
        <div className="absolute right-5 top-5 rounded-2xl bg-[var(--gkli-primary-light)] p-2 text-[var(--gkli-primary)]">
          <Settings size={18} />
        </div>
        <h2 className="text-lg font-medium text-slate-950">Área administrativa</h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
          Área restrita a administradores. Aqui ficarão configurações globais, logs e parâmetros sensíveis.
        </p>
      </Card>
    </div>
  )
}
