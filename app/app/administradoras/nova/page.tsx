import { PageHeader } from '@/components/ui/page-header'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { createAdministradora } from '@/features/administradoras/actions'

export default function NovaAdministradoraPage() {
  return (
    <div className="space-y-5">
      <PageHeader eyebrow="Administradoras" title="Nova administradora" description="Cadastre a administradora para vincular contatos, solicitações e pendências externas." />
      <Card>
        <form action={createAdministradora} className="grid gap-4 md:grid-cols-2">
          <label className="space-y-1.5"><span className="text-xs font-medium uppercase tracking-[0.14em] text-slate-400">Nome / razão social</span><Input name="nome" required /></label>
          <label className="space-y-1.5"><span className="text-xs font-medium uppercase tracking-[0.14em] text-slate-400">Nome operacional</span><Input name="nome_operacional" placeholder="Como a equipe chama no dia a dia" /></label>
          <label className="space-y-1.5"><span className="text-xs font-medium uppercase tracking-[0.14em] text-slate-400">CNPJ *</span><Input name="cnpj" required inputMode="numeric" placeholder="00.000.000/0000-00" /></label>
          <label className="space-y-1.5"><span className="text-xs font-medium uppercase tracking-[0.14em] text-slate-400">Status</span><Select name="status" defaultValue="ativo"><option value="ativo">Ativo</option><option value="inativo">Inativo</option></Select></label>
          <label className="space-y-1.5"><span className="text-xs font-medium uppercase tracking-[0.14em] text-slate-400">E-mail geral</span><Input name="email" type="email" /></label>
          <label className="space-y-1.5"><span className="text-xs font-medium uppercase tracking-[0.14em] text-slate-400">Telefone</span><Input name="telefone" /></label>
          <label className="space-y-1.5"><span className="text-xs font-medium uppercase tracking-[0.14em] text-slate-400">Site</span><Input name="site" /></label>
          <label className="space-y-1.5"><span className="text-xs font-medium uppercase tracking-[0.14em] text-slate-400">Responsável interno</span><Input name="responsavel_interno" /></label>
          <label className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 md:col-span-2">
            <input type="checkbox" name="acesso_gerar_acordo" className="mt-1 h-4 w-4 rounded border-slate-300 accent-[var(--gkli-primary)]" />
            <span>
              <span className="block text-sm font-medium text-slate-950">Acesso para gerar acordo</span>
              <span className="mt-1 block text-xs leading-5 text-slate-500">Marque quando esta administradora puder operar ou receber fluxo de geração de acordo.</span>
            </span>
          </label>
          <label className="space-y-1.5 md:col-span-2"><span className="text-xs font-medium uppercase tracking-[0.14em] text-slate-400">Observações</span><Textarea name="observacoes" rows={4} /></label>
          <div className="md:col-span-2"><Button type="submit">Salvar administradora</Button></div>
        </form>
      </Card>
    </div>
  )
}
