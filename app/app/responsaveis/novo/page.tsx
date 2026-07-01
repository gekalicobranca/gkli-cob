import { ArrowLeft, UserRound } from 'lucide-react'
import { PageHeader } from '@/components/ui/page-header'
import { Card } from '@/components/ui/card'
import { ButtonLink } from '@/components/ui/button'
import { PendingSubmitButton } from '@/components/ui/pending-submit-button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { CondominioSearchSelect } from '@/components/gestao/condominio-search-select'
import { SearchableSelect } from '@/components/ui/searchable-select'
import { Textarea } from '@/components/ui/textarea'
import { getPermittedCarteiras } from '@/utils/auth/get-permitted-carteiras'
import { listCarteirasForSelect, listCondominiosForSelect } from '@/features/cadastros/queries'
import { createResponsavelUnidade } from '@/features/responsaveis-unidades/actions'

export default async function NovoResponsavelPage() {
  const scope = await getPermittedCarteiras()
  const [carteiras, condominios] = await Promise.all([
    listCarteirasForSelect(scope),
    listCondominiosForSelect(scope),
  ])

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Base Cadastral"
        title="Novo responsável"
        description="Cadastre o contato de apoio da unidade e informe se o responsável é proprietário ou inquilino."
        actions={<ButtonLink href="/app/responsaveis" variant="secondary"><ArrowLeft size={16} />Voltar</ButtonLink>}
      />

      <Card className="space-y-5">
        <div className="flex items-start gap-3">
          <div className="rounded-2xl bg-slate-100 p-2 text-slate-500">
            <UserRound size={18} />
          </div>
          <div>
            <h2 className="text-base font-medium text-slate-950">Responsável de apoio</h2>
            <p className="mt-1 text-sm text-slate-500">Esses dados enriquecem importações e ajudam a identificar o responsável correto nos acordos.</p>
          </div>
        </div>

        <form action={createResponsavelUnidade} className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <label className="space-y-1.5 xl:col-span-1">
            <span className="text-xs font-medium uppercase tracking-[0.14em] text-slate-400">Carteira</span>
            <SearchableSelect
              name="carteira_id"
              options={carteiras.map((carteira: any) => ({ value: carteira.id, label: carteira.nome }))}
              placeholder="Digite parte da carteira"
              required
            />
          </label>

          <label className="space-y-1.5 xl:col-span-2">
            <span className="text-xs font-medium uppercase tracking-[0.14em] text-slate-400">Condomínio</span>
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
          </label>

          <label className="space-y-1.5">
            <span className="text-xs font-medium uppercase tracking-[0.14em] text-slate-400">Tipo</span>
            <Select name="tipo_responsavel" defaultValue="nao_informado">
              <option value="nao_informado">Não informado</option>
              <option value="proprietario">Proprietário</option>
              <option value="inquilino">Inquilino</option>
            </Select>
          </label>

          <label className="space-y-1.5">
            <span className="text-xs font-medium uppercase tracking-[0.14em] text-slate-400">Bloco</span>
            <Input name="bloco" />
          </label>

          <label className="space-y-1.5">
            <span className="text-xs font-medium uppercase tracking-[0.14em] text-slate-400">Unidade</span>
            <Input name="unidade" required />
          </label>

          <label className="space-y-1.5 md:col-span-2">
            <span className="text-xs font-medium uppercase tracking-[0.14em] text-slate-400">Responsável</span>
            <Input name="responsavel_nome" />
          </label>

          <label className="space-y-1.5">
            <span className="text-xs font-medium uppercase tracking-[0.14em] text-slate-400">Documento</span>
            <Input name="responsavel_documento" />
          </label>

          <label className="space-y-1.5">
            <span className="text-xs font-medium uppercase tracking-[0.14em] text-slate-400">Telefone</span>
            <Input name="telefone" />
          </label>

          <label className="space-y-1.5 md:col-span-2">
            <span className="text-xs font-medium uppercase tracking-[0.14em] text-slate-400">E-mail</span>
            <Input name="email" type="email" />
          </label>

          <label className="space-y-1.5 md:col-span-2 xl:col-span-4">
            <span className="text-xs font-medium uppercase tracking-[0.14em] text-slate-400">Observações</span>
            <Textarea name="observacoes" rows={4} />
          </label>

          <div className="md:col-span-2 xl:col-span-4">
            <PendingSubmitButton pendingLabel="Salvando...">
              Salvar responsável
            </PendingSubmitButton>
          </div>
        </form>
      </Card>
    </div>
  )
}
