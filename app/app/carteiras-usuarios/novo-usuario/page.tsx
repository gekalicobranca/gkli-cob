import { PageHeader } from '@/components/ui/page-header'
import { Card } from '@/components/ui/card'
import { Button, ButtonLink } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { FormField } from '@/components/ui/form-field'
import { requireAdmin } from '@/utils/auth/require-admin'
import { listAllCarteirasForAdmin } from '@/features/carteiras/queries'
import { createUsuario } from '@/features/carteiras/actions'

export default async function NovoUsuarioPage() {
  await requireAdmin()

  const carteiras = await listAllCarteirasForAdmin()

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Gestão"
        title="Novo usuário"
        description="Crie um usuário no Supabase Auth, defina o perfil e opcionalmente vincule a uma carteira."
      />

      <Card>
        <form action={createUsuario} className="space-y-5">
          <div className="grid gap-5 md:grid-cols-2">
            <FormField label="Nome">
              <Input name="nome" required placeholder="Nome do usuário" />
            </FormField>

            <FormField label="E-mail">
              <Input name="email" type="email" required placeholder="usuario@email.com" />
            </FormField>

            <FormField label="Senha temporária">
              <Input name="password" type="password" required minLength={6} placeholder="Mínimo 6 caracteres" />
            </FormField>

            <FormField label="Perfil">
              <Select name="role" defaultValue="operador" required>
                <option value="admin">admin</option>
                <option value="gestor">gestor</option>
                <option value="operador">operador</option>
                <option value="leitura">leitura</option>
              </Select>
            </FormField>

            <FormField label="Carteira inicial" hint="Opcional. Admin enxerga tudo mesmo sem vínculo.">
              <Select name="carteira_id" defaultValue="">
                <option value="">Sem vínculo inicial</option>
                {carteiras.map((carteira: any) => (
                  <option key={carteira.id} value={carteira.id}>
                    {carteira.nome}
                  </option>
                ))}
              </Select>
            </FormField>
          </div>

          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-800">
            O usuário será criado com e-mail confirmado e senha temporária. Depois podemos implementar fluxo de convite/reset de senha.
          </div>

          <div className="flex justify-end gap-2">
            <ButtonLink href="/app/carteiras-usuarios" variant="secondary">Cancelar</ButtonLink>
            <Button type="submit">Criar usuário</Button>
          </div>
        </form>
      </Card>
    </div>
  )
}
