import { PageHeader } from '@/components/ui/page-header'
import { Card } from '@/components/ui/card'
import { Button, ButtonLink } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { FormField } from '@/components/ui/form-field'
import { requireAdmin } from '@/utils/auth/require-admin'
import { createCarteira } from '@/features/carteiras/actions'

export default async function NovaCarteiraPage() {
  await requireAdmin()

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Gestão"
        title="Nova carteira"
        description="Crie uma carteira operacional para isolar condomínios, cobranças e permissões."
      />

      <Card>
        <form action={createCarteira} className="space-y-5">
          <FormField label="Nome da carteira">
            

<Input name="nome" required placeholder="Ex.: Genske Advogados" />
          </FormField>

          <FormField label="Descrição">
            <Textarea name="descricao" placeholder="Descrição interna da carteira..." />
          </FormField>

          <FormField label="Logo URL" hint="Opcional. Use apenas URL HTTPS.">
            <Input name="logo_url" placeholder="https://..." />
          </FormField>

          <div className="flex justify-end gap-2">
            <ButtonLink href="/app/carteiras-usuarios" variant="secondary">Cancelar</ButtonLink>
            <Button type="submit">Salvar carteira</Button>
          </div>
        </form>
      </Card>
    </div>
  )
}
