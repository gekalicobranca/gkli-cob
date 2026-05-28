import { notFound } from 'next/navigation'
import { Save } from 'lucide-react'
import { PageHeader } from '@/components/ui/page-header'
import { Card } from '@/components/ui/card'
import { Button, ButtonLink } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { FormField } from '@/components/ui/form-field'
import { getPermittedCarteiras } from '@/utils/auth/get-permitted-carteiras'
import { getUnidadeIntegral } from '@/features/unidades/queries'
import { updateUnidade } from '@/features/unidades/actions'

export default async function UnidadeDetalhePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const scope = await getPermittedCarteiras()
  const unidade = await getUnidadeIntegral(id, scope)

  if (!unidade) {
    notFound()
  }

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Base Cadastral"
        title={`Unidade ${unidade.identificacao ?? ''}`}
        description="Consulta e edição operacional da unidade, responsável e contatos."
        actions={
          <>
            <ButtonLink href="/app/unidades" variant="secondary">Voltar</ButtonLink>
            <ButtonLink href="#cadastro">Editar cadastro</ButtonLink>
          </>
        }
      />


      <Card id="cadastro" className="p-6">
        <div className="mb-5">
          <h2 className="text-lg font-semibold text-slate-950">Editar cadastro</h2>
          <p className="mt-1 text-sm text-slate-500">Atualize os dados mestres da unidade. Essas informações alimentam cobrança, acordos e mensageria.</p>
        </div>

        <form action={updateUnidade} className="space-y-5">
          <input type="hidden" name="id" value={unidade.id} />

          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
              <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Carteira</div>
              <div className="mt-2 text-sm font-semibold text-slate-950">{unidade.carteiras?.nome ?? 'Carteira não informada'}</div>
              <p className="mt-1 text-xs text-slate-500">Campo bloqueado na edição para preservar o vínculo operacional da unidade.</p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
              <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Condomínio</div>
              <div className="mt-2 text-sm font-semibold text-slate-950">{unidade.condominios?.nome ?? 'Condomínio não informado'}</div>
              <p className="mt-1 text-xs text-slate-500">Para trocar a unidade de condomínio, crie uma nova unidade ou faça ajuste técnico controlado.</p>
            </div>
          </div>

          <div className="grid gap-5 md:grid-cols-2">
            <FormField label="Identificação da unidade">
              <Input name="identificacao" required defaultValue={unidade.identificacao ?? ''} placeholder="Ex.: 101, 305, Casa 12" />
            </FormField>

            <FormField label="Bloco">
              <Input name="bloco" defaultValue={unidade.bloco ?? ''} placeholder="Ex.: A" />
            </FormField>

            <FormField label="Status">
              <Select name="status" defaultValue={unidade.status ?? 'ativa'}>
                <option value="ativa">Ativa</option>
                <option value="inativa">Inativa</option>
                <option value="suspensa">Suspensa</option>
              </Select>
            </FormField>

            <FormField label="Responsável">
              <Input name="responsavel_nome" defaultValue={unidade.responsavel_nome ?? ''} placeholder="Nome do responsável" />
            </FormField>

            <FormField label="Documento">
              <Input name="responsavel_documento" defaultValue={unidade.responsavel_documento ?? ''} placeholder="CPF/CNPJ" />
            </FormField>

            <FormField label="Telefone">
              <Input name="telefone" defaultValue={unidade.telefone ?? ''} placeholder="WhatsApp/telefone" />
            </FormField>

            <FormField label="E-mail">
              <Input name="email" type="email" defaultValue={unidade.email ?? ''} placeholder="email@exemplo.com" />
            </FormField>
          </div>

          <FormField label="Observações">
            <Textarea name="observacoes" defaultValue={unidade.observacoes ?? ''} placeholder="Observações internas..." />
          </FormField>

          <div className="flex justify-end gap-2">
            <ButtonLink href="/app/unidades" variant="secondary">Cancelar</ButtonLink>
            <Button type="submit"><Save size={16} />Salvar alterações</Button>
          </div>
        </form>
      </Card>
    </div>
  )
}
