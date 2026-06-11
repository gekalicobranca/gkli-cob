import { ArrowLeft, Save, UserRound } from 'lucide-react'
import { notFound } from 'next/navigation'
import { PageHeader } from '@/components/ui/page-header'
import { Card } from '@/components/ui/card'
import { ButtonLink } from '@/components/ui/button'
import { PendingSubmitButton } from '@/components/ui/pending-submit-button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { getPermittedCarteiras } from '@/utils/auth/get-permitted-carteiras'
import { updateResponsavelUnidade } from '@/features/responsaveis-unidades/actions'
import { getResponsavelUnidadeById } from '@/features/responsaveis-unidades/queries'

type ResponsavelPageProps = {
  params: Promise<{ id: string }>
}

function tipoLabel(value?: string | null) {
  if (value === 'proprietario') return 'Proprietário'
  if (value === 'inquilino') return 'Inquilino'
  return 'Não informado'
}

function formatDateTime(value?: string | null) {
  if (!value) return '-'
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value))
}

export default async function ResponsavelDetalhePage({ params }: ResponsavelPageProps) {
  const { id } = await params
  const scope = await getPermittedCarteiras()
  const responsavel = await getResponsavelUnidadeById(scope, id)

  if (!responsavel) notFound()

  const completo = Boolean(
    responsavel.responsavel_nome &&
    responsavel.responsavel_documento &&
    responsavel.telefone &&
    responsavel.email,
  )

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Responsáveis"
        title="Cadastro do responsável"
        description="Dados de apoio para importações, acordos e acionamentos da unidade."
        actions={<ButtonLink href="/app/responsaveis" variant="secondary"><ArrowLeft size={16} />Voltar</ButtonLink>}
      />

      <Card className="space-y-5">
        <div className="flex flex-col gap-4 border-b border-slate-100 pb-5 md:flex-row md:items-start md:justify-between">
          <div className="flex items-start gap-3">
            <div className="rounded-2xl bg-slate-100 p-2 text-slate-500">
              <UserRound size={18} />
            </div>
            <div>
              <h2 className="text-base font-medium text-slate-950">{responsavel.responsavel_nome || 'Responsável não informado'}</h2>
              <p className="mt-1 text-sm text-slate-500">
                {responsavel.condominios?.nome ?? 'Condomínio não informado'} · Bloco {responsavel.bloco || '-'} · Unidade {responsavel.unidade || '-'}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge tone={responsavel.ativo !== false ? 'green' : 'slate'}>{responsavel.ativo !== false ? 'Ativo' : 'Inativo'}</Badge>
            <Badge tone={completo ? 'green' : 'yellow'}>{completo ? 'Completo' : 'Cadastro incompleto'}</Badge>
            <Badge tone="blue">{tipoLabel(responsavel.tipo_responsavel)}</Badge>
          </div>
        </div>

        <form action={updateResponsavelUnidade} className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <input type="hidden" name="id" value={responsavel.id} />
          <input type="hidden" name="return_to" value="/app/responsaveis" />

          <div className="space-y-1.5">
            <span className="text-xs font-medium uppercase tracking-[0.14em] text-slate-400">Carteira</span>
            <div className="flex h-11 items-center rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm text-slate-600">
              {responsavel.carteiras?.nome ?? '-'}
            </div>
          </div>

          <div className="space-y-1.5 md:col-span-2">
            <span className="text-xs font-medium uppercase tracking-[0.14em] text-slate-400">Condomínio</span>
            <div className="flex h-11 items-center rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm text-slate-600">
              {responsavel.condominios?.nome ?? '-'}
            </div>
          </div>

          <label className="space-y-1.5">
            <span className="text-xs font-medium uppercase tracking-[0.14em] text-slate-400">Tipo</span>
            <Select name="tipo_responsavel" defaultValue={responsavel.tipo_responsavel ?? 'nao_informado'}>
              <option value="nao_informado">Não informado</option>
              <option value="proprietario">Proprietário</option>
              <option value="inquilino">Inquilino</option>
            </Select>
          </label>

          <label className="space-y-1.5">
            <span className="text-xs font-medium uppercase tracking-[0.14em] text-slate-400">Bloco</span>
            <Input name="bloco" defaultValue={responsavel.bloco ?? ''} />
          </label>

          <label className="space-y-1.5">
            <span className="text-xs font-medium uppercase tracking-[0.14em] text-slate-400">Unidade</span>
            <Input name="unidade" required defaultValue={responsavel.unidade ?? ''} />
          </label>

          <label className="space-y-1.5 md:col-span-2">
            <span className="text-xs font-medium uppercase tracking-[0.14em] text-slate-400">Responsável</span>
            <Input name="responsavel_nome" defaultValue={responsavel.responsavel_nome ?? ''} />
          </label>

          <label className="space-y-1.5">
            <span className="text-xs font-medium uppercase tracking-[0.14em] text-slate-400">Documento</span>
            <Input name="responsavel_documento" defaultValue={responsavel.responsavel_documento ?? ''} />
          </label>

          <label className="space-y-1.5">
            <span className="text-xs font-medium uppercase tracking-[0.14em] text-slate-400">Telefone</span>
            <Input name="telefone" defaultValue={responsavel.telefone ?? ''} />
          </label>

          <label className="space-y-1.5 md:col-span-2">
            <span className="text-xs font-medium uppercase tracking-[0.14em] text-slate-400">E-mail</span>
            <Input name="email" type="email" defaultValue={responsavel.email ?? ''} />
          </label>

          <label className="space-y-1.5">
            <span className="text-xs font-medium uppercase tracking-[0.14em] text-slate-400">Status</span>
            <span className="flex h-11 items-center gap-2 rounded-xl border border-slate-200 px-3">
              <input
                type="checkbox"
                name="ativo"
                defaultChecked={responsavel.ativo !== false}
                className="size-4 rounded border-slate-300"
              />
              <span className="text-sm text-slate-700">Cadastro ativo</span>
            </span>
          </label>

          <label className="space-y-1.5 md:col-span-2 xl:col-span-4">
            <span className="text-xs font-medium uppercase tracking-[0.14em] text-slate-400">Observações</span>
            <Textarea name="observacoes" rows={4} defaultValue={responsavel.observacoes ?? ''} />
          </label>

          <div className="flex flex-col gap-3 border-t border-slate-100 pt-4 md:col-span-2 md:flex-row md:items-center md:justify-between xl:col-span-4">
            <p className="text-xs text-slate-500">
              Criado em {formatDateTime(responsavel.created_at)} · Atualizado em {formatDateTime(responsavel.updated_at)}
            </p>
            <PendingSubmitButton pendingLabel="Salvando..." icon={<Save size={16} />}>
              Salvar cadastro
            </PendingSubmitButton>
          </div>
        </form>
      </Card>
    </div>
  )
}
