import { redirect } from 'next/navigation'
import { PageHeader } from '@/components/ui/page-header'
import { Card } from '@/components/ui/card'
import { Button, ButtonLink } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { TemplatePreview } from '@/features/mensageria/components/template-preview'
import { criarTemplateMensagem } from '@/features/mensageria/actions'

export default function NovoTemplateMensageriaPage() {
  async function createTemplate(formData: FormData) {
    'use server'
    const id = await criarTemplateMensagem(formData)
    redirect(`/app/mensageria/templates/${id}`)
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Mensageria"
        title="Novo template"
        description="Crie um modelo reutilizável para régua de cobrança, acordos ou mensagens manuais."
        actions={<ButtonLink href="/app/mensageria/templates" variant="header">Voltar</ButtonLink>}
      />

      <form action={createTemplate} className="space-y-5">
        <Card className="space-y-5">
          <div className="grid gap-4 lg:grid-cols-4">
            <div className="space-y-2 lg:col-span-2">
              <label className="text-sm font-medium text-slate-700" htmlFor="nome">Nome</label>
              <Input id="nome" name="nome" placeholder="Cobrança amigável inicial" required />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700" htmlFor="tipo">Tipo</label>
              <Select id="tipo" name="tipo" defaultValue="cobranca">
                <option value="cobranca">Cobrança</option>
                <option value="acordo">Acordo</option>
                <option value="juridico">Jurídico</option>
                <option value="manual">Manual</option>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700" htmlFor="canal">Canal</label>
              <Select id="canal" name="canal" defaultValue="whatsapp">
                <option value="whatsapp">WhatsApp</option>
                <option value="email">E-mail</option>
                <option value="sms">SMS</option>
              </Select>
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-[1fr_160px] lg:items-end">
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700" htmlFor="assunto">Assunto</label>
              <Input id="assunto" name="assunto" placeholder="Opcional para e-mail" />
            </div>
            <label className="flex h-11 items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 text-sm font-medium text-slate-700">
              <input type="checkbox" name="ativo" defaultChecked className="h-4 w-4 rounded border-slate-300" />
              Ativo
            </label>
          </div>
        </Card>

        <Card>
          <TemplatePreview initialContent="Olá {{primeiro_nome}}.\n\nIdentificamos uma pendência da unidade {{unidade}} do condomínio {{condominio}}.\n\nValor atualizado: {{valor}}\n\nEntre em contato para regularização." />
        </Card>

        <div className="flex justify-end gap-2">
          <ButtonLink href="/app/mensageria/templates" variant="secondary">Cancelar</ButtonLink>
          <Button type="submit">Salvar template</Button>
        </div>
      </form>
    </div>
  )
}
