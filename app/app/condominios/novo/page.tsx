import { PageHeader } from '@/components/ui/page-header'
import { Card } from '@/components/ui/card'
import { Button, ButtonLink } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { SearchableSelect } from '@/components/ui/searchable-select'
import { Textarea } from '@/components/ui/textarea'
import { FormField } from '@/components/ui/form-field'
import { getPermittedCarteiras } from '@/utils/auth/get-permitted-carteiras'
import { listCarteirasForSelect } from '@/features/cadastros/queries'
import { createCondominio } from '@/features/condominios/actions'
import { ClassificacaoOperacionalField } from '@/features/condominios/components/classificacao-operacional'

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
              <SearchableSelect
                name="carteira_id"
                options={carteiras.map((carteira: any) => ({ value: carteira.id, label: carteira.nome }))}
                placeholder="Digite parte da carteira"
                required
              />
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

            <FormField label="Parcelas permitidas sem aprovação do síndico" hint="0 deixa sempre livre; acima deste número o acordo fica bloqueado até aprovação pública do síndico.">
              <Input name="parcelas_acordo_sem_aprovacao_sindico" type="number" min="0" defaultValue="0" />
            </FormField>

            <FormField label="Dias para reemissão de parcela de acordo em atraso" hint="0 não permite reemissão pelo acompanhamento de parcelas.">
              <Input name="dias_reemissao_parcela_acordo_atrasada" type="number" min="0" defaultValue="0" />
            </FormField>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <label className="flex items-start gap-3 text-sm text-slate-700">
              <input
                type="checkbox"
                name="operacao_virtual_habilitada"
                className="mt-1 h-4 w-4 rounded border-slate-300 accent-[var(--gkli-primary)]"
              />
              <span>
                <span className="block font-medium text-slate-950">Permitir operação virtual</span>
                <span className="mt-1 block text-xs leading-5 text-slate-500">
                  Quando habilitado, a Keila pode considerar este condomínio para filas, tarefas e lotes supervisionados.
                </span>
              </span>
            </label>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
            <ClassificacaoOperacionalField defaultValue="prata" />
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
