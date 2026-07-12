import { PageHeader } from '@/components/ui/page-header'
import { Card } from '@/components/ui/card'
import { Button, ButtonLink } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { FormField } from '@/components/ui/form-field'
import { requireAdmin } from '@/utils/auth/require-admin'
import { createCarteira } from '@/features/carteiras/actions'

export default async function NovaCarteiraPage() {
  await requireAdmin()

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Gestão"
        title="Nova carteira"
        description="Crie uma carteira operacional para isolar condomínios, cobranças e permissões."
      />

      <Card>
        <form action={createCarteira} className="space-y-5">
          <FormField label="Nome da carteira">
            

<Input name="nome" required placeholder="Ex.: Genske Advogados" />
          </FormField>

          <FormField label="Descrição">
            <Textarea name="descricao" placeholder="Descrição interna da carteira..." />
          </FormField>

          <FormField label="Logo URL" hint="Opcional. Use apenas URL HTTPS.">
            <Input name="logo_url" placeholder="https://..." />
          </FormField>

          <div className="border-t border-slate-100 pt-5">
            <h2 className="text-sm font-semibold text-slate-950">Emissao de NFS-e</h2>
            <p className="mt-1 text-sm text-slate-500">Dados fiscais usados para montar a base de notas no fechamento mensal.</p>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <FormField label="CNPJ emissor">
              <Input name="nfse_emissor_cnpj" placeholder="Somente numeros" inputMode="numeric" />
            </FormField>

            <FormField label="Razao social emissora">
              <Input name="nfse_emissor_razao_social" placeholder="Ex.: Genske Sociedade Individual de Advocacia" />
            </FormField>

            <FormField label="Inscricao municipal">
              <Input name="nfse_emissor_inscricao_municipal" placeholder="Ex.: 61958131" />
            </FormField>

            <FormField label="Municipio / UF">
              <div className="grid gap-2 sm:grid-cols-[1fr_90px]">
                <Input name="nfse_emissor_municipio" placeholder="Sao Paulo" />
                <Input name="nfse_emissor_uf" placeholder="SP" maxLength={2} />
              </div>
            </FormField>

            <FormField label="Codigo do servico">
              <Input name="nfse_codigo_servico" placeholder="03220" />
            </FormField>

            <FormField label="Codigo LC 116">
              <Input name="nfse_codigo_lc116" placeholder="17.14" />
            </FormField>

            <FormField label="Serie RPS">
              <Input name="nfse_serie_rps" placeholder="NFSE" />
            </FormField>
          </div>

          <div className="flex justify-end gap-2">
            <ButtonLink href="/app/carteiras-usuarios" variant="secondary">Cancelar</ButtonLink>
            <Button type="submit">Salvar carteira</Button>
          </div>
        </form>
      </Card>
    </div>
  )
}
