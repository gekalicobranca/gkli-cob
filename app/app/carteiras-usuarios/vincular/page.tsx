import { PageHeader } from '@/components/ui/page-header'
import { Card } from '@/components/ui/card'
import { Button, ButtonLink } from '@/components/ui/button'
import { SearchableSelect } from '@/components/ui/searchable-select'
import { FormField } from '@/components/ui/form-field'
import { requireAdmin } from '@/utils/auth/require-admin'
import {
  listAllCarteirasForAdmin,
  listProfilesForAdmin,
} from '@/features/carteiras/queries'
import { createUsuarioCarteira } from '@/features/carteiras/actions'

export default async function VincularUsuarioCarteiraPage() {
  await requireAdmin()

  const [profiles, carteiras] = await Promise.all([
    listProfilesForAdmin(),
    listAllCarteirasForAdmin(),
  ])

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Gestão"
        title="Vincular usuário à carteira"
        description="Libere o acesso de um usuário a uma carteira específica."
      />

      <Card>
        <form action={createUsuarioCarteira} className="space-y-5">
          <FormField label="Usuário">
            <SearchableSelect
              name="user_id"
              options={profiles.map((profile: any) => ({
                value: profile.id,
                label: `${profile.nome ?? profile.email} - ${profile.role}`,
              }))}
              placeholder="Digite nome ou e-mail do usuário"
              required
            />
          </FormField>

          <FormField label="Carteira">
            <SearchableSelect
              name="carteira_id"
              options={carteiras.map((carteira: any) => ({ value: carteira.id, label: carteira.nome }))}
              placeholder="Digite parte da carteira"
              required
            />
          </FormField>

          <div className="flex justify-end gap-2">
            <ButtonLink href="/app/carteiras-usuarios" variant="secondary">Cancelar</ButtonLink>
            <Button type="submit">Salvar vínculo</Button>
          </div>
        </form>
      </Card>
    </div>
  )
}
