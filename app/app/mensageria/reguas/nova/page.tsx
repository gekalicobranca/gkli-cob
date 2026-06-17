import { ArrowLeft } from 'lucide-react'
import { PageHeader } from '@/components/ui/page-header'
import { Card } from '@/components/ui/card'
import { Button, ButtonLink } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { FormField } from '@/components/ui/form-field'
import { getPermittedCarteiras } from '@/utils/auth/get-permitted-carteiras'
import { listCarteirasForSelect } from '@/features/cadastros/queries'
import { criarReguaOperacional } from '@/features/reguas/actions'

export default async function NovaReguaPage() {
  const scope = await getPermittedCarteiras()
  let carteiras: Awaited<ReturnType<typeof listCarteirasForSelect>> = []

  try {
    carteiras = await listCarteirasForSelect(scope)
  } catch {
    carteiras = []
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Mensageria · Réguas"
        title="Nova régua"
        description="Crie uma régua de cobrança ou acordos. Depois você adiciona as etapas no builder visual."
        actions={<ButtonLink href="/app/mensageria/reguas" variant="header"><ArrowLeft size={16} /> Voltar</ButtonLink>}
      />

      <form action={criarReguaOperacional}>
        <Card className="space-y-5">
          <div className="grid gap-4 md:grid-cols-2">
            <FormField label="Nome da régua"><Input name="nome" required placeholder="Ex.: Cobrança amigável padrão" /></FormField>
            <FormField label="Tipo"><Select name="tipo" defaultValue="cobranca"><option value="cobranca">Cobrança</option><option value="acordo">Acordos</option></Select></FormField>
            <FormField label="Carteira"><Select name="carteira_id" defaultValue=""><option value="">Global / fallback</option>{carteiras.map((carteira: any) => <option key={carteira.id} value={carteira.id}>{carteira.nome}</option>)}</Select></FormField>
            <FormField label="Status"><Select name="status" defaultValue="ativa"><option value="ativa">Ativa</option><option value="rascunho">Rascunho</option><option value="inativa">Inativa</option></Select></FormField>
            <FormField label="Prioridade"><Input name="prioridade" type="number" defaultValue="0" /></FormField>
            <FormField label="Usar como padrão"><label className="mt-3 inline-flex items-center gap-2 text-sm text-slate-600"><input name="padrao" type="checkbox" className="h-4 w-4 rounded border-slate-300" /> Régua padrão no escopo</label></FormField>
          </div>
          <FormField label="Descrição"><Textarea name="descricao" placeholder="Objetivo operacional, público e observações de uso." /></FormField>
          <div className="flex justify-end gap-2 border-t border-slate-100 pt-4"><ButtonLink href="/app/mensageria/reguas" variant="secondary">Cancelar</ButtonLink><Button type="submit">Criar régua</Button></div>
        </Card>
      </form>
    </div>
  )
}
