import { PageHeader } from '@/components/ui/page-header'
import { Card } from '@/components/ui/card'
import { Button, ButtonLink } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { FormField } from '@/components/ui/form-field'
import { getPermittedCarteiras } from '@/utils/auth/get-permitted-carteiras'
import { listCarteirasForSelect, listCondominiosForSelect } from '@/features/cadastros/queries'
import { createUnidade } from '@/features/unidades/actions'

export default async function NovaUnidadePage() {
  const scope = await getPermittedCarteiras()
  const [carteiras, condominios] = await Promise.all([
    listCarteirasForSelect(scope),
    listCondominiosForSelect(scope),
  ])

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Base Cadastral"
        title="Nova unidade"
        description="Cadastre uma unidade vinculada a um condomínio e carteira."
      />

      <Card>
        <form action={createUnidade} className="space-y-5">
          <div className="grid gap-5 md:grid-cols-2">
            <FormField label="Carteira">
              <Select name="carteira_id" required>
                <option value="">Selecione...</option>
                {carteiras.map((carteira: any) => (
                  <option key={carteira.id} value={carteira.id}>{carteira.nome}</option>
                ))}
              </Select>
            </FormField>

            <FormField label="Condomínio">
              <Select name="condominio_id" required>
                <option value="">Selecione...</option>
                {condominios.map((condominio: any) => (
                  <option key={condominio.id} value={condominio.id}>{condominio.nome}</option>
                ))}
              </Select>
            </FormField>

            <FormField label="Identificação da unidade">
              <Input name="identificacao" required placeholder="Ex.: 101, 305, Casa 12" />
            </FormField>

            <FormField label="Bloco">
              <Input name="bloco" placeholder="Ex.: A" />
            </FormField>

            <FormField label="Responsável">
              <Input name="responsavel_nome" placeholder="Nome do responsável" />
            </FormField>

            <FormField label="Documento">
              <Input name="responsavel_documento" placeholder="CPF/CNPJ" />
            </FormField>

            <FormField label="Telefone">
              <Input name="telefone" placeholder="WhatsApp/telefone" />
            </FormField>

            <FormField label="E-mail">
              <Input name="email" type="email" placeholder="email@exemplo.com" />
            </FormField>
          </div>

          <FormField label="Observações">
            <Textarea name="observacoes" placeholder="Observações internas..." />
          </FormField>

          <div className="flex justify-end gap-2">
            <ButtonLink href="/app/unidades" variant="secondary">Cancelar</ButtonLink>
            <Button type="submit">Salvar unidade</Button>
          </div>
        </form>
      </Card>
    </div>
  )
}
