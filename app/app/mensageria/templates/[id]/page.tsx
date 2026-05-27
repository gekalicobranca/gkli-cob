import { notFound, redirect } from 'next/navigation'
import { PageHeader } from '@/components/ui/page-header'
import { Card } from '@/components/ui/card'
import { Button, ButtonLink } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { getPermittedCarteiras } from '@/utils/auth/get-permitted-carteiras'
import { getTemplateDetalhe } from '@/features/mensageria/queries'
import { atualizarTemplateMensagem } from '@/features/mensageria/actions'
import { TemplatePreview } from '@/features/mensageria/components/template-preview'
import { TEMPLATE_CATEGORIES, categoryLabel } from '@/features/mensageria/render-template'
import { listCarteirasForSelect } from '@/features/cadastros/queries'

export default async function EditarTemplateMensageriaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const scope = await getPermittedCarteiras()
  const [template, carteiras] = await Promise.all([
    getTemplateDetalhe(id, scope),
    listCarteirasForSelect(scope),
  ])

  if (!template) notFound()

  async function updateTemplate(formData: FormData) {
    'use server'
    await atualizarTemplateMensagem(id, formData)
    redirect('/app/mensageria/templates')
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Mensageria"
        title="Editar template"
        description="Ajuste o modelo. Mensagens já geradas preservam o snapshot salvo no lote."
        actions={<ButtonLink href="/app/mensageria/templates" variant="header">Voltar</ButtonLink>}
      />

      <form action={updateTemplate} className="space-y-5">
        <Card className="space-y-5">
          <div className="grid gap-4 xl:grid-cols-4">
            <div className="space-y-2 xl:col-span-2">
              <label className="text-sm font-medium text-slate-700" htmlFor="nome">Nome</label>
              <Input id="nome" name="nome" defaultValue={template.nome ?? ''} required />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700" htmlFor="tipo_regua">Fluxo</label>
              <Select id="tipo_regua" name="tipo_regua" defaultValue={template.tipo_regua ?? template.tipo ?? 'cobranca'}>
                <option value="cobranca">Cobrança</option>
                <option value="acordo">Acordo</option>
              </Select>
              <input type="hidden" name="tipo" value={template.tipo ?? 'cobranca'} />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700" htmlFor="categoria">Situação</label>
              <Select id="categoria" name="categoria" defaultValue={template.categoria ?? 'cobranca_inicial'}>
                {TEMPLATE_CATEGORIES.map((categoria) => <option key={categoria} value={categoria}>{categoryLabel(categoria)}</option>)}
              </Select>
            </div>
          </div>

          <div className="grid gap-4 xl:grid-cols-[minmax(240px,0.8fr)_1fr_150px_140px_160px] xl:items-end">
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700" htmlFor="carteira_id">Carteira autorizada</label>
              <Select id="carteira_id" name="carteira_id" defaultValue={template.carteira_id ?? ''} required={!scope.isAdmin}>
                {scope.isAdmin ? (
                  <option value="">Global — todas as carteiras</option>
                ) : (
                  <option value="">Selecione uma carteira</option>
                )}
                {carteiras.map((carteira: any) => (
                  <option key={carteira.id} value={carteira.id}>{carteira.nome}</option>
                ))}
              </Select>
              <p className="text-xs text-slate-500">
                Altere a carteira para limitar quem pode usar este template.
              </p>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700" htmlFor="assunto">Assunto</label>
              <Input id="assunto" name="assunto" defaultValue={template.assunto ?? ''} placeholder="Opcional para e-mail" />
            </div>

            <div className="space-y-2"><label className="text-sm font-medium text-slate-700" htmlFor="intensidade">Intensidade</label><Select id="intensidade" name="intensidade" defaultValue={template.intensidade ?? 'medio'}><option value="leve">Leve</option><option value="medio">Médio</option><option value="agressivo">Agressivo</option></Select></div>
            <div className="space-y-2"><label className="text-sm font-medium text-slate-700" htmlFor="canal">Canal</label><Select id="canal" name="canal" defaultValue={template.canal ?? 'whatsapp'}><option value="whatsapp">WhatsApp</option><option value="email">E-mail</option><option value="sms">SMS</option><option value="manual">Manual</option></Select></div>
            <div className="space-y-2"><label className="text-sm font-medium text-slate-700" htmlFor="prioridade">Prioridade</label><Input id="prioridade" name="prioridade" type="number" defaultValue={String(template.prioridade ?? 0)} /></div>

            <label className="flex h-11 items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 text-sm font-medium text-slate-700">
              <input type="checkbox" name="ativo" defaultChecked={Boolean(template.ativo)} className="h-4 w-4 rounded border-slate-300" />
              Ativo
            </label>
          </div>
        </Card>

        <Card>
          <TemplatePreview initialContent={template.conteudo ?? ''} />
        </Card>

        <div className="flex justify-end gap-2">
          <ButtonLink href="/app/mensageria/templates" variant="secondary">Cancelar</ButtonLink>
          <Button type="submit">Salvar alterações</Button>
        </div>
      </form>
    </div>
  )
}
