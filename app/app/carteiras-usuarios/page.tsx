import { Edit3, Plus, ShieldCheck, UserPlus, Users } from 'lucide-react'
import { PageHeader } from '@/components/ui/page-header'
import { Card } from '@/components/ui/card'
import { Button, ButtonLink } from '@/components/ui/button'
import { StatusBadge } from '@/components/data/status-badge'
import { EmptyState } from '@/components/data/empty-state'
import { requireAdmin } from '@/utils/auth/require-admin'
import {
  listAllCarteirasForAdmin,
  listProfilesForAdmin,
  listUsuariosCarteirasForAdmin,
} from '@/features/carteiras/queries'
import { removeUsuarioCarteira, updateUserRole } from '@/features/carteiras/actions'

export default async function CarteirasUsuariosPage() {
  await requireAdmin()

  const [carteiras, profiles, vinculos] = await Promise.all([
    listAllCarteirasForAdmin(),
    listProfilesForAdmin(),
    listUsuariosCarteirasForAdmin(),
  ])

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Gestão"
        title="Carteiras x Usuários"
        description="Crie carteiras, usuários, perfis e vínculos de acesso por base operacional."
        actions={
          <>
            <ButtonLink href="/app/carteiras-usuarios/novo-usuario" variant="secondary"><UserPlus size={16} />Novo usuário</ButtonLink>
            <ButtonLink href="/app/carteiras-usuarios/vincular" variant="secondary"><Users size={16} />Vincular</ButtonLink>
            <ButtonLink href="/app/carteiras-usuarios/nova"><Plus size={16} />Nova carteira</ButtonLink>
          </>
        }
      />

      <section className="grid gap-3 md:grid-cols-3">
        <Card className="relative overflow-hidden p-5"><div className="absolute right-4 top-4 rounded-2xl bg-[var(--gkli-primary-light)] p-2 text-[var(--gkli-primary)]"><ShieldCheck size={18} /></div><p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">Carteiras</p><p className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">{carteiras.length}</p><p className="mt-1 text-sm text-slate-500">bases operacionais</p></Card>
        <Card className="p-5"><p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">Usuários</p><p className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">{profiles.length}</p><p className="mt-1 text-sm text-slate-500">profiles ativos</p></Card>
        <Card className="p-5"><p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">Vínculos</p><p className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">{vinculos.length}</p><p className="mt-1 text-sm text-slate-500">permissões por carteira</p></Card>
      </section>

      <section className="grid gap-5 xl:grid-cols-2">
        <Card className="overflow-hidden p-0">
          <div className="border-b border-slate-100 px-5 py-4"><h2 className="text-base font-medium text-slate-950">Usuários e perfis</h2><p className="mt-1 text-sm text-slate-500">Ajuste o perfil operacional de cada usuário.</p></div>
          {profiles.length === 0 ? <div className="p-5"><EmptyState title="Nenhum usuário" description="Crie um usuário para começar." /></div> : (
            <div className="divide-y divide-slate-100">
              {profiles.map((profile: any) => (
                <div key={profile.id} className="grid gap-3 px-5 py-4 md:grid-cols-[1fr_310px] md:items-center">
                  <div><p className="text-sm font-medium text-slate-950">{profile.nome ?? 'Sem nome'}</p><p className="mt-1 text-xs text-slate-500">{profile.email}</p></div>
                  <div className="flex flex-wrap items-center justify-start gap-2 md:justify-end">
                    <form action={updateUserRole} className="flex gap-2">
                      <input type="hidden" name="user_id" value={profile.id} />
                      <select name="role" defaultValue={profile.role} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none">
                        <option value="admin">admin</option><option value="gestor">gestor</option><option value="operador">operador</option><option value="leitura">leitura</option>
                      </select>
                      <Button type="submit" variant="secondary">Salvar</Button>
                    </form>
                    <ButtonLink href={`/app/carteiras-usuarios/usuarios/${profile.id}/editar`} variant="secondary" size="sm"><Edit3 size={14} />Editar</ButtonLink>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card className="overflow-hidden p-0">
          <div className="border-b border-slate-100 px-5 py-4"><h2 className="text-base font-medium text-slate-950">Carteiras</h2><p className="mt-1 text-sm text-slate-500">Bases operacionais cadastradas.</p></div>
          {carteiras.length === 0 ? <div className="p-5"><EmptyState title="Nenhuma carteira" description="Crie uma carteira para iniciar." /></div> : (
            <div className="divide-y divide-slate-100">
              {carteiras.map((carteira: any) => (
                <div key={carteira.id} className="grid gap-3 px-5 py-4 md:grid-cols-[1fr_220px] md:items-center">
                  <div><p className="text-sm font-medium text-slate-950">{carteira.nome}</p><p className="mt-1 text-xs text-slate-500">{carteira.descricao ?? 'Sem descrição'}</p></div>
                  <div className="flex flex-wrap items-center justify-start gap-2 md:justify-end">
                    <StatusBadge status={carteira.ativo ? 'ativo' : 'inativo'} />
                    <ButtonLink href={`/app/carteiras-usuarios/${carteira.id}/editar`} variant="secondary" size="sm"><Edit3 size={14} />Editar</ButtonLink>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </section>

      <Card className="overflow-hidden p-0">
        <div className="border-b border-slate-100 px-5 py-4"><h2 className="text-base font-medium text-slate-950">Vínculos usuário x carteira</h2><p className="mt-1 text-sm text-slate-500">Usuários comuns só enxergam as carteiras vinculadas aqui.</p></div>
        {vinculos.length === 0 ? <div className="p-5"><EmptyState title="Nenhum vínculo" description="Crie um vínculo para liberar acesso por carteira." /></div> : (
          <div className="divide-y divide-slate-100">
            {vinculos.map((vinculo: any) => (
              <div key={`${vinculo.user_id}-${vinculo.carteira_id}`} className="grid gap-3 px-5 py-4 md:grid-cols-[1fr_1fr_120px] md:items-center">
                <div><p className="text-sm font-medium text-slate-950">{vinculo.profiles?.nome ?? 'Usuário sem nome'}</p><p className="mt-1 text-xs text-slate-500">{vinculo.profiles?.email ?? vinculo.user_id}</p></div>
                <div><p className="text-sm font-medium text-slate-950">{vinculo.carteiras?.nome ?? 'Carteira não encontrada'}</p><p className="mt-1 text-xs text-slate-500">Perfil: {vinculo.profiles?.role ?? '-'}</p></div>
                <form action={removeUsuarioCarteira}><input type="hidden" name="user_id" value={vinculo.user_id} /><input type="hidden" name="carteira_id" value={vinculo.carteira_id} /><Button type="submit" variant="danger">Remover</Button></form>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  )
}
