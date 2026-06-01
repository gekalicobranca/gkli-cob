import { PageHeader } from '@/components/ui/page-header'
import { Card } from '@/components/ui/card'
import { Button, ButtonLink } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { FormField } from '@/components/ui/form-field'
import { getPermittedCarteiras } from '@/utils/auth/get-permitted-carteiras'
import {
  listCarteirasForSelect,
  listCondominiosForSelect,
  listUnidadesForSelect,
} from '@/features/cadastros/queries'
import { createCobranca } from '@/features/cobrancas/actions'

export default async function NovaCobrancaPage() {
  const scope = await getPermittedCarteiras()
  const [carteiras, condominios, unidades] = await Promise.all([
    listCarteirasForSelect(scope),
    listCondominiosForSelect(scope),
    listUnidadesForSelect(scope),
  ])

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Base Operacional"
        title="Nova cobrança"
        description="Cadastre uma cobrança manual vinculada a carteira, condomínio e unidade."
      />

      <Card>
        <form action={createCobranca} className="space-y-5">
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

            <FormField label="Unidade">
              <Select name="unidade_id" required>
                <option value="">Selecione...</option>
                {unidades.map((unidade: any) => (
                  <option key={unidade.id} value={unidade.id}>
                    {unidade.identificacao} · {unidade.responsavel_nome ?? 'sem responsável'}
                  </option>
                ))}
              </Select>
            </FormField>

            <FormField label="Competência">
              <Input name="competencia" placeholder="Ex.: 2026-05" />
            </FormField>

            <FormField label="Vencimento">
              <Input name="vencimento" type="date" required />
            </FormField>

            <FormField label="Valor original">
              <Input name="valor_original" defaultValue="0" />
            </FormField>

            <FormField label="Valor atualizado">
              <Input name="valor_atualizado" defaultValue="0" />
            </FormField>
          </div>

          <FormField label="Observações">
            <Textarea name="observacoes" placeholder="Observações internas..." />
          </FormField>

          <div className="flex justify-end gap-2">
            <ButtonLink href="/app/cobrancas" variant="secondary">Cancelar</ButtonLink>
            <Button type="submit">Salvar cobrança</Button>
          </div>
        </form>
      </Card>
    </div>
  )
}
