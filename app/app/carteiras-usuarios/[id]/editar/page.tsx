import { notFound } from 'next/navigation'
import { PageHeader } from '@/components/ui/page-header'
import { Card } from '@/components/ui/card'
import { Button, ButtonLink } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { FormField } from '@/components/ui/form-field'
import { requireAdmin } from '@/utils/auth/require-admin'
import { updateCarteira } from '@/features/carteiras/actions'
import { getCarteiraByIdForAdmin } from '@/features/carteiras/queries'

type EditarCarteiraPageProps = {
  params: Promise<{
    id: string
  }>
}

export default async function EditarCarteiraPage({ params }: EditarCarteiraPageProps) {
  await requireAdmin()

  const { id } = await params
  const carteira = await getCarteiraByIdForAdmin(id)

  if (!carteira) {
    notFound()
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Gestão"
        title="Editar carteira"
        description="Atualize a base operacional, descrição, logo e status de uso."
      />

      <Card>
        <form action={updateCarteira} className="space-y-5">
          <input type="hidden" name="id" value={carteira.id} />

          <FormField label="Nome da carteira">
            

<Input name="nome" required defaultValue={carteira.nome ?? ''} placeholder="Ex.: Genske Advogados" />
          </FormField>

          <FormField label="Descrição">
            <Textarea name="descricao" defaultValue={carteira.descricao ?? ''} placeholder="Descrição interna da carteira..." />
          </FormField>

          <FormField label="Logo URL" hint="Opcional. Use apenas URL HTTPS.">
            <Input name="logo_url" defaultValue={carteira.logo_url ?? ''} placeholder="https://..." />
          </FormField>

          <label className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
            <input
              type="checkbox"
              name="ativo"
              defaultChecked={Boolean(carteira.ativo)}
              className="mt-1 h-4 w-4 rounded border-slate-300 text-[var(--gkli-primary)] focus:ring-[var(--gkli-primary)]"
            />
            <span>
              <span className="block font-medium text-slate-950">Carteira ativa</span>
              <span className="mt-1 block text-xs text-slate-500">Carteiras inativas seguem cadastradas, mas podem ser ocultadas dos fluxos operacionais.</span>
            </span>
          </label>

          <div className="flex justify-end gap-2">
            <ButtonLink href="/app/carteiras-usuarios" variant="secondary">Cancelar</ButtonLink>
            <Button type="submit">Salvar alterações</Button>
          </div>
        </form>
      </Card>
    </div>
  )
}
