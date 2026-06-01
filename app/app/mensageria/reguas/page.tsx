import Link from 'next/link'
import { ArrowRight, CheckCircle2, GitBranch, Plus, SlidersHorizontal } from 'lucide-react'
import { PageHeader } from '@/components/ui/page-header'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ButtonLink } from '@/components/ui/button'
import { getPermittedCarteiras } from '@/utils/auth/get-permitted-carteiras'
import { listReguasOperacionais } from '@/features/reguas/queries'

function count(rows: any[], predicate: (row: any) => boolean) {
  return rows.filter(predicate).length
}

function tipoLabel(tipo?: string | null) {
  return tipo === 'acordo' ? 'Acordos' : 'Cobrança'
}

function statusTone(status?: string | null) {
  if (status === 'ativa') return 'green'
  if (status === 'rascunho') return 'yellow'
  return 'slate'
}

export default async function ReguasPage() {
  const scope = await getPermittedCarteiras()
  const reguas = await listReguasOperacionais(scope)

  const ativas = count(reguas, (row) => row.status === 'ativa' || row.ativo === true)
  const cobranca = count(reguas, (row) => row.tipo === 'cobranca')
  const acordos = count(reguas, (row) => row.tipo === 'acordo')

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Mensageria · Réguas"
        title="Réguas operacionais"
        description="Editor visual das réguas de cobrança e de acordos, com etapas configuráveis e vínculo por carteira/condomínio."
        actions={
          <ButtonLink href="/app/mensageria/reguas/nova" variant="header">
            <Plus size={16} /> Nova régua
          </ButtonLink>
        }
      />

      <section className="grid gap-3 md:grid-cols-4">
        <Card className="p-4"><Metric label="Réguas" value={reguas.length} detail="cadastradas" /></Card>
        <Card className="p-4"><Metric label="Ativas" value={ativas} detail="em uso operacional" /></Card>
        <Card className="p-4"><Metric label="Cobrança" value={cobranca} detail="fluxo extrajudicial" /></Card>
        <Card className="p-4"><Metric label="Acordos" value={acordos} detail="parcelas e rompimento" /></Card>
      </section>

      <Card className="overflow-hidden p-0">
        <div className="flex flex-col gap-3 border-b border-slate-100 p-5 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="flex items-center gap-2 text-sm text-slate-500"><GitBranch size={16} /> Builder operacional</div>
            <h2 className="mt-2 text-lg font-semibold text-slate-950">Configurações disponíveis</h2>
            <p className="mt-1 text-sm text-slate-500">A régua padrão pode ser global, por carteira ou associada diretamente ao condomínio.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <ButtonLink href="/app/mensageria/reguas/automacao" variant="secondary">Automação R2</ButtonLink>
            <ButtonLink href="/app/regua-cobranca" variant="secondary">Prévia cobrança</ButtonLink>
            <ButtonLink href="/app/regua-acordo" variant="secondary">Prévia acordos</ButtonLink>
          </div>
        </div>

        {reguas.length === 0 ? (
          <div className="p-6 text-sm text-slate-500">Nenhuma régua cadastrada. Crie a primeira régua para substituir os padrões hardcoded.</div>
        ) : (
          <div className="divide-y divide-slate-100">
            {reguas.map((regua: any) => (
              <Link key={regua.id} href={`/app/mensageria/reguas/${regua.id}`} className="grid gap-4 px-5 py-4 transition hover:bg-slate-50 lg:grid-cols-[1fr_150px_150px_120px] lg:items-center">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={regua.tipo === 'acordo' ? 'blue' : 'primary'}>{tipoLabel(regua.tipo)}</Badge>
                    <Badge tone={statusTone(regua.status) as any}>{regua.status ?? 'ativa'}</Badge>
                    {regua.padrao ? <Badge tone="green"><CheckCircle2 size={12} className="mr-1" /> padrão</Badge> : null}
                  </div>
                  <p className="mt-3 text-sm font-semibold text-slate-950">{regua.nome}</p>
                  <p className="mt-1 text-sm text-slate-500">{regua.descricao || 'Sem descrição operacional.'}</p>
                </div>
                <div className="text-sm text-slate-600">{regua.carteiras?.nome ?? 'Global'}</div>
                <div className="text-sm text-slate-600">Prioridade {regua.prioridade ?? 0}</div>
                <div className="inline-flex items-center justify-end gap-2 text-sm text-[var(--gkli-primary)]">
                  Editar <ArrowRight size={14} />
                </div>
              </Link>
            ))}
          </div>
        )}
      </Card>

      <Card className="p-5">
        <div className="flex gap-3 text-sm text-slate-600">
          <SlidersHorizontal className="mt-0.5 h-5 w-5 shrink-0 text-[var(--gkli-primary)]" />
          <div>
            <p className="font-semibold text-slate-950">Modelo R1 + R2</p>
            <p className="mt-1 leading-6">Os retornos seguem manuais, mas agora alimentam timeline, suspensão inteligente e analytics. WhatsApp/e-mail automático entram depois como novas origens de evento, sem refatorar o motor.</p>
          </div>
        </div>
      </Card>
    </div>
  )
}

function Metric({ label, value, detail }: { label: string; value: number; detail: string }) {
  return <><p className="text-xs uppercase tracking-[0.16em] text-slate-400">{label}</p><p className="mt-3 text-3xl text-slate-950">{value}</p><p className="mt-1 text-sm text-slate-500">{detail}</p></>
}
