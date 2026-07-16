import { notFound } from 'next/navigation'
import { PageHeader } from '@/components/ui/page-header'
import { Card } from '@/components/ui/card'
import { Button, ButtonLink } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { FormField } from '@/components/ui/form-field'
import { requireAdmin } from '@/utils/auth/require-admin'
import { updateCarteira } from '@/features/carteiras/actions'
import { getCarteiraByIdForAdmin } from '@/features/carteiras/queries'

type EditarCarteiraPageProps = {
  params: Promise<{
    id: string
  }>
}

export default async function EditarCarteiraPage({ params }: EditarCarteiraPageProps) {
  await requireAdmin()

  const { id } = await params
  const carteira = await getCarteiraByIdForAdmin(id)

  if (!carteira) {
    notFound()
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Gestão"
        title="Editar carteira"
        description="Atualize a base operacional, descrição, logo e status de uso."
      />

      <Card>
        <form action={updateCarteira} className="space-y-5">
          <input type="hidden" name="id" value={carteira.id} />

          <FormField label="Nome da carteira">
            

<Input name="nome" required defaultValue={carteira.nome ?? ''} placeholder="Ex.: Genske Advogados" />
          </FormField>

          <FormField label="Descrição">
            <Textarea name="descricao" defaultValue={carteira.descricao ?? ''} placeholder="Descrição interna da carteira..." />
          </FormField>

          <FormField label="Logo URL" hint="Opcional. Use apenas URL HTTPS.">
            <Input name="logo_url" defaultValue={carteira.logo_url ?? ''} placeholder="https://..." />
          </FormField>

          <label className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
            <input
              type="checkbox"
              name="pre_juridico_habilitado"
              defaultChecked={Boolean(carteira.pre_juridico_habilitado)}
              className="mt-1 h-4 w-4 rounded border-slate-300 text-[var(--gkli-primary)] focus:ring-[var(--gkli-primary)]"
            />
            <span>
              <span className="block font-medium text-slate-950">Gerar pré-jurídico nesta carteira</span>
              <span className="mt-1 block text-xs text-slate-500">Quando desligado, acordos da carteira não entram na fila nem geram documentos, lote ou mensagens pré-jurídicas.</span>
            </span>
          </label>

          <div className="border-t border-slate-100 pt-5">
            <h2 className="text-sm font-semibold text-slate-950">Emissao de NFS-e</h2>
            <p className="mt-1 text-sm text-slate-500">Dados fiscais usados para montar a base de notas no fechamento mensal.</p>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <FormField label="CNPJ emissor">
              <Input name="nfse_emissor_cnpj" defaultValue={carteira.nfse_emissor_cnpj ?? ''} placeholder="Somente numeros" inputMode="numeric" />
            </FormField>

            <FormField label="Razao social emissora">
              <Input name="nfse_emissor_razao_social" defaultValue={carteira.nfse_emissor_razao_social ?? ''} placeholder="Ex.: Genske Sociedade Individual de Advocacia" />
            </FormField>

            <FormField label="Inscricao municipal">
              <Input name="nfse_emissor_inscricao_municipal" defaultValue={carteira.nfse_emissor_inscricao_municipal ?? ''} placeholder="Ex.: 61958131" />
            </FormField>

            <FormField label="Municipio / UF">
              <div className="grid gap-2 sm:grid-cols-[1fr_90px]">
                <Input name="nfse_emissor_municipio" defaultValue={carteira.nfse_emissor_municipio ?? ''} placeholder="Sao Paulo" />
                <Input name="nfse_emissor_uf" defaultValue={carteira.nfse_emissor_uf ?? ''} placeholder="SP" maxLength={2} />
              </div>
            </FormField>

            <FormField label="Codigo do servico">
              <Input name="nfse_codigo_servico" defaultValue={carteira.nfse_codigo_servico ?? ''} placeholder="03220" />
            </FormField>

            <FormField label="Codigo LC 116">
              <Input name="nfse_codigo_lc116" defaultValue={carteira.nfse_codigo_lc116 ?? ''} placeholder="17.14" />
            </FormField>

            <FormField label="Serie RPS">
              <Input name="nfse_serie_rps" defaultValue={carteira.nfse_serie_rps ?? ''} placeholder="NFSE" />
            </FormField>
          </div>

          <label className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
            <input
              type="checkbox"
              name="ativo"
              defaultChecked={Boolean(carteira.ativo)}
              className="mt-1 h-4 w-4 rounded border-slate-300 text-[var(--gkli-primary)] focus:ring-[var(--gkli-primary)]"
            />
            <span>
              <span className="block font-medium text-slate-950">Carteira ativa</span>
              <span className="mt-1 block text-xs text-slate-500">Carteiras inativas seguem cadastradas, mas podem ser ocultadas dos fluxos operacionais.</span>
            </span>
          </label>

          <div className="flex justify-end gap-2">
            <ButtonLink href="/app/carteiras-usuarios" variant="secondary">Cancelar</ButtonLink>
            <Button type="submit">Salvar alterações</Button>
          </div>
        </form>
      </Card>
    </div>
  )
}
