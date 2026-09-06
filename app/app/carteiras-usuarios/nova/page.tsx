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

          <FormField label="Participação no resultado (%)" hint="Aplicada sobre o repasse líquido de impostos no fechamento.">
            <Input name="percentual_participacao_resultado" type="number" min="0" max="100" step="0.0001" defaultValue="0" required />
          </FormField>

          <fieldset className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <legend className="px-1 text-sm font-semibold text-slate-950">Canais de comunicação permitidos</legend>
            <p className="mb-3 mt-1 text-xs text-slate-500">As réguas só poderão gerar mensagens nos canais selecionados para esta carteira.</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-900">
                <input type="checkbox" name="email_habilitado" defaultChecked className="h-4 w-4 rounded border-slate-300 text-[var(--gkli-primary)] focus:ring-[var(--gkli-primary)]" />
                E-mail
              </label>
              <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-900">
                <input type="checkbox" name="whatsapp_habilitado" className="h-4 w-4 rounded border-slate-300 text-[var(--gkli-primary)] focus:ring-[var(--gkli-primary)]" />
                WhatsApp
              </label>
            </div>
          </fieldset>

          <fieldset className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <legend className="px-1 text-sm font-semibold text-slate-950">Linha remetente do WhatsApp</legend>
            <p className="mb-3 mt-1 text-xs text-slate-500">O Flow herda esta escolha automaticamente. A linha global GEKALI é o padrão.</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700">
                <input type="radio" name="whatsapp_remetente_modo" value="global" defaultChecked className="mt-1 h-4 w-4 border-slate-300 text-[var(--gkli-primary)] focus:ring-[var(--gkli-primary)]" />
                <span><span className="block font-medium text-slate-950">Linha global GEKALI</span><span className="mt-1 block text-xs text-slate-500">Usa o número padrão da operação.</span></span>
              </label>
              <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700">
                <input type="radio" name="whatsapp_remetente_modo" value="proprio" className="mt-1 h-4 w-4 border-slate-300 text-[var(--gkli-primary)] focus:ring-[var(--gkli-primary)]" />
                <span><span className="block font-medium text-slate-950">Número próprio da carteira</span><span className="mt-1 block text-xs text-slate-500">Usa uma linha registrada especificamente para esta carteira.</span></span>
              </label>
            </div>
            <div className="mt-4 grid gap-4 md:grid-cols-3">
              <FormField label="Número próprio" hint="Preencha somente ao selecionar número próprio."><Input name="whatsapp_numero_proprio" placeholder="Ex.: 5511921118973" inputMode="numeric" /></FormField>
              <FormField label="Phone Number ID"><Input name="whatsapp_phone_number_id" placeholder="ID fornecido pela Meta" /></FormField>
              <FormField label="WABA ID" hint="Opcional enquanto estiver na mesma conta empresarial."><Input name="whatsapp_waba_id" placeholder="ID da conta do WhatsApp" /></FormField>
            </div>
          </fieldset>

          <label className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
            <input
              type="checkbox"
              name="pre_juridico_habilitado"
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
