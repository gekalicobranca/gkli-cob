import { redirect } from 'next/navigation'
import { PageHeader } from '@/components/ui/page-header'
import { Card } from '@/components/ui/card'
import { Button, ButtonLink } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { SearchableSelect } from '@/components/ui/searchable-select'
import { TemplatePreview } from '@/features/mensageria/components/template-preview'
import { TEMPLATE_CATEGORIES, categoryLabel } from '@/features/mensageria/render-template'
import { criarTemplateMensagem } from '@/features/mensageria/actions'
import { getPermittedCarteiras } from '@/utils/auth/get-permitted-carteiras'
import { listCarteirasForSelect } from '@/features/cadastros/queries'

export default async function NovoTemplateMensageriaPage() {
  const scope = await getPermittedCarteiras()
  const carteiras = await listCarteirasForSelect(scope)

  async function createTemplate(formData: FormData) {
    'use server'
    await criarTemplateMensagem(formData)
    redirect('/app/mensageria/templates')
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
          <div className="grid gap-4 xl:grid-cols-4">
            <div className="space-y-2 xl:col-span-2">
              <label className="text-sm font-medium text-slate-700" htmlFor="nome">Nome</label>
              <Input id="nome" name="nome" placeholder="Cobrança amigável inicial" required />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700" htmlFor="tipo_regua">Fluxo</label>
              <Select id="tipo_regua" name="tipo_regua" defaultValue="cobranca">
                <option value="cobranca">Cobrança</option>
                <option value="acordo">Acordo</option>
                <option value="juridico">Jurídico</option>
              </Select>
              <input type="hidden" name="tipo" value="cobranca" />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700" htmlFor="categoria">Situação</label>
              <Select id="categoria" name="categoria" defaultValue="cobranca_inicial">
                {TEMPLATE_CATEGORIES.map((categoria) => <option key={categoria} value={categoria}>{categoryLabel(categoria)}</option>)}
              </Select>
            </div>
          </div>

          <div className="grid gap-4 xl:grid-cols-[minmax(240px,0.8fr)_1fr_150px_140px_160px] xl:items-end">
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700" htmlFor="carteira_id">Carteira autorizada</label>
              <SearchableSelect
                id="carteira_id"
                name="carteira_id"
                options={carteiras.map((carteira: any) => ({ value: carteira.id, label: carteira.nome }))}
                placeholder={scope.isAdmin ? "Global - todas as carteiras" : "Digite parte da carteira"}
                required={!scope.isAdmin}
              />
              <p className="text-xs text-slate-500">
                Escolha uma carteira específica ou deixe global quando o template puder ser usado por todas.
              </p>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700" htmlFor="assunto">Assunto</label>
              <Input id="assunto" name="assunto" placeholder="Opcional para e-mail" />
            </div>

            <div className="space-y-2"><label className="text-sm font-medium text-slate-700" htmlFor="intensidade">Intensidade</label><Select id="intensidade" name="intensidade" defaultValue="medio"><option value="leve">Leve</option><option value="medio">Médio</option><option value="agressivo">Agressivo</option></Select></div>
            <div className="space-y-2"><label className="text-sm font-medium text-slate-700" htmlFor="canal">Canal</label><Select id="canal" name="canal" defaultValue="whatsapp"><option value="whatsapp">WhatsApp</option><option value="email">E-mail</option><option value="sms">SMS</option><option value="manual">Manual</option></Select></div>
            <div className="space-y-2"><label className="text-sm font-medium text-slate-700" htmlFor="prioridade">Prioridade</label><Input id="prioridade" name="prioridade" type="number" defaultValue="0" /></div>

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
