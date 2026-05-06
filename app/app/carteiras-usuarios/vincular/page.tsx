import { PageHeader } from '@/components/ui/page-header'
import { Card } from '@/components/ui/card'
import { Button, ButtonLink } from '@/components/ui/button'
import { Select } from '@/components/ui/select'
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
            <Select name="user_id" required>
              <option value="">Selecione...</option>
              {profiles.map((profile: any) => (
                <option key={profile.id} value={profile.id}>
                  {profile.nome ?? profile.email} · {profile.role}
                </option>
              ))}
            </Select>
          </FormField>

          <FormField label="Carteira">
            <Select name="carteira_id" required>
              <option value="">Selecione...</option>
              {carteiras.map((carteira: any) => (
                <option key={carteira.id} value={carteira.id}>
                  {carteira.nome}
                </option>
              ))}
            </Select>
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
