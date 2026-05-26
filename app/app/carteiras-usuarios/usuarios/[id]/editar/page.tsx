import { notFound } from 'next/navigation'
import { PageHeader } from '@/components/ui/page-header'
import { Card } from '@/components/ui/card'
import { Button, ButtonLink } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { FormField } from '@/components/ui/form-field'
import { requireAdmin } from '@/utils/auth/require-admin'
import { updateUsuarioCompleto } from '@/features/carteiras/actions'
import {
  getProfileByIdForAdmin,
  listAllCarteirasForAdmin,
} from '@/features/carteiras/queries'

type EditarUsuarioPageProps = {
  params: Promise<{
    id: string
  }>
}

export default async function EditarUsuarioPage({ params }: EditarUsuarioPageProps) {
  await requireAdmin()

  const { id } = await params

  const [usuario, carteiras] = await Promise.all([
    getProfileByIdForAdmin(id),
    listAllCarteirasForAdmin(),
  ])

  if (!usuario) {
    notFound()
  }

  const carteiraIds = new Set<string>(usuario.carteiraIds ?? [])

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Gestão"
        title="Editar usuário"
        description="Atualize o nome, perfil operacional e carteiras vinculadas sem recriar o usuário no Auth."
      />

      <Card>
        <form action={updateUsuarioCompleto} className="space-y-5">
          <input type="hidden" name="user_id" value={usuario.id} />

          <div className="grid gap-5 md:grid-cols-2">
            <FormField label="Nome">
              <Input name="nome" required defaultValue={usuario.nome ?? ''} placeholder="Nome do usuário" />
            </FormField>

            <FormField label="E-mail" hint="O e-mail vem do Auth/Profile e não é alterado nesta tela.">
              <Input value={usuario.email ?? ''} disabled readOnly />
            </FormField>

            <FormField label="Perfil">
              <Select name="role" defaultValue={usuario.role ?? 'operador'} required>
                <option value="admin">admin</option>
                <option value="gestor">gestor</option>
                <option value="operador">operador</option>
                <option value="leitura">leitura</option>
              </Select>
            </FormField>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-sm font-semibold text-slate-950">Carteiras vinculadas</h2>
                <p className="mt-1 text-xs leading-5 text-slate-500">
                  Para usuários não admin, marque as carteiras que devem ficar liberadas. Admin continua com visão global.
                </p>
              </div>
            </div>

            {carteiras.length === 0 ? (
              <p className="mt-4 rounded-xl border border-dashed border-slate-300 bg-white p-4 text-sm text-slate-500">
                Nenhuma carteira cadastrada ainda.
              </p>
            ) : (
              <div className="mt-4 grid gap-2 md:grid-cols-2">
                {carteiras.map((carteira: any) => (
                  <label
                    key={carteira.id}
                    className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700"
                  >
                    <input
                      type="checkbox"
                      name="carteira_ids"
                      value={carteira.id}
                      defaultChecked={carteiraIds.has(carteira.id)}
                      className="mt-1 h-4 w-4 rounded border-slate-300 text-[var(--gkli-primary)] focus:ring-[var(--gkli-primary)]"
                    />
                    <span>
                      <span className="block font-medium text-slate-950">{carteira.nome}</span>
                      <span className="mt-1 block text-xs text-slate-500">{carteira.descricao ?? 'Sem descrição'}</span>
                    </span>
                  </label>
                ))}
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2">
            <ButtonLink href="/app/carteiras-usuarios" variant="secondary">Cancelar</ButtonLink>
            <Button type="submit">Salvar usuário</Button>
          </div>
        </form>
      </Card>
    </div>
  )
}
