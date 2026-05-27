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
import { listCarteirasForSelect, listCondominiosForSelect } from '@/features/cadastros/queries'
import { getUnidadeIntegral } from '@/features/unidades/queries'
import { updateUnidade } from '@/features/unidades/actions'

export default async function UnidadeDetalhePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const scope = await getPermittedCarteiras()
  const [unidade, carteiras, condominios] = await Promise.all([
    getUnidadeIntegral(id, scope),
    listCarteirasForSelect(scope),
    listCondominiosForSelect(scope),
  ])

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

          <div className="grid gap-5 md:grid-cols-2">
            <FormField label="Carteira">
              <Select name="carteira_id" required defaultValue={unidade.carteira_id ?? ''}>
                <option value="">Selecione...</option>
                {carteiras.map((carteira: any) => (
                  <option key={carteira.id} value={carteira.id}>{carteira.nome}</option>
                ))}
              </Select>
            </FormField>

            <FormField label="Condomínio">
              <Select name="condominio_id" required defaultValue={unidade.condominio_id ?? ''}>
                <option value="">Selecione...</option>
                {condominios.map((condominio: any) => (
                  <option key={condominio.id} value={condominio.id}>{condominio.nome}</option>
                ))}
              </Select>
            </FormField>

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
