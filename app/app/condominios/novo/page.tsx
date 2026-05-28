import { PageHeader } from '@/components/ui/page-header'
import { Card } from '@/components/ui/card'
import { Button, ButtonLink } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { FormField } from '@/components/ui/form-field'
import { getPermittedCarteiras } from '@/utils/auth/get-permitted-carteiras'
import { listCarteirasForSelect } from '@/features/cadastros/queries'
import { createCondominio } from '@/features/condominios/actions'

export default async function NovoCondominioPage() {
  const scope = await getPermittedCarteiras()
  const carteiras = await listCarteirasForSelect(scope)

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Base Cadastral"
        title="Novo condomínio"
        description="Cadastre um condomínio vinculado a uma carteira operacional."
      />

      <Card>
        <form action={createCondominio} className="space-y-5">
          <div className="grid gap-5 md:grid-cols-2">
            <FormField label="Carteira">
              <Select name="carteira_id" required>
                <option value="">Selecione...</option>
                {carteiras.map((carteira: any) => (
                  <option key={carteira.id} value={carteira.id}>{carteira.nome}</option>
                ))}
              </Select>
            </FormField>

            <FormField label="Nome oficial do condomínio">
              <Input name="nome" required placeholder="Ex.: Condomínio Jardim das Águas" />
            </FormField>

            <FormField label="Nome operacional">
              <Input name="nome_operacional" placeholder="Ex.: Jardim das Águas" />
            </FormField>

            <FormField label="CNPJ">
              <Input name="cnpj" placeholder="Somente números ou formatado" />
            </FormField>

            <FormField label="Administradora">
              <Input name="administradora" placeholder="Ex.: Administradora Alfa" />
            </FormField>

            <FormField label="Dia de vencimento da cota">
              <Input name="vencimento_cota_dia" type="number" min="1" max="31" defaultValue="10" />
            </FormField>

            <FormField label="Valor médio da cota">
              <Input name="valor_cota_condominial" defaultValue="0" />
            </FormField>

            <FormField label="Início da cobrança após X dias">
              <Input name="inicio_cobranca_dias" type="number" min="0" defaultValue="30" />
            </FormField>
          </div>

          <FormField label="Observações">
            <Textarea name="observacoes" placeholder="Observações internas..." />
          </FormField>

          <div className="flex justify-end gap-2">
            <ButtonLink href="/app/condominios" variant="secondary">Cancelar</ButtonLink>
            <Button type="submit">Salvar condomínio</Button>
          </div>
        </form>
      </Card>
    </div>
  )
}
