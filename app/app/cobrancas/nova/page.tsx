import { PageHeader } from '@/components/ui/page-header'
import { Card } from '@/components/ui/card'
import { Button, ButtonLink } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { FormField } from '@/components/ui/form-field'
import { CondominioSearchSelect } from '@/components/gestao/condominio-search-select'
import { SearchableSelect } from '@/components/ui/searchable-select'
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
              <SearchableSelect
                name="carteira_id"
                options={carteiras.map((carteira: any) => ({ value: carteira.id, label: carteira.nome }))}
                placeholder="Digite parte do nome da carteira"
                required
              />
            </FormField>

            <FormField label="Condomínio">
              <CondominioSearchSelect
                name="condominio_id"
                options={condominios.map((condominio: any) => ({
                  id: condominio.id,
                  nome: condominio.nome,
                  administradora: condominio.administradora ?? null,
                }))}
                defaultToFirst={false}
                inputClassName=""
                required
              />
            </FormField>

            <FormField label="Unidade">
              <SearchableSelect
                name="unidade_id"
                options={unidades.map((unidade: any) => ({
                  value: unidade.id,
                  label: `${unidade.identificacao} - ${unidade.responsavel_nome ?? 'sem responsável'}`,
                }))}
                placeholder="Digite unidade ou responsável"
                required
              />
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
