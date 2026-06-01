import { FileText, MessageSquareText, Sparkles } from 'lucide-react'
import { PageHeader } from '@/components/ui/page-header'
import { Card } from '@/components/ui/card'
import { ButtonLink } from '@/components/ui/button'
import { listTemplatesAdm } from '@/features/administradoras/queries'

function tipoLabel(tipo?: string | null) {
  const map: Record<string, string> = { pedido_planilha_debitos: 'Pedido de planilha', pedido_boleto_acordo: 'Pedido de boleto', registro_acordo_realizado: 'Registro de acordo', atualizacao_debito: 'Atualização de débito', confirmacao_pagamento: 'Confirmação de pagamento', outros: 'Outros' }
  return map[String(tipo)] ?? String(tipo ?? '-')
}

export default async function MensageriaAdmPage() {
  const templates = await listTemplatesAdm()
  return (
    <div className="space-y-5">
      <PageHeader eyebrow="Administradoras" title="Mensageria ADM" description="Mensageria separada para administradoras: planilhas de débitos, boletos de acordo, registros e follow-up externo." actions={<ButtonLink href="/app/administradoras/solicitacoes" variant="secondary">Ver solicitações</ButtonLink>} />
      <section className="grid gap-3 md:grid-cols-3">
        <Card className="p-5"><MessageSquareText className="text-[var(--gkli-primary)]" size={22} /><p className="mt-4 text-sm font-medium text-slate-950">Canal administrativo</p><p className="mt-1 text-sm text-slate-500">Separado da mensageria de devedores.</p></Card>
        <Card className="p-5"><FileText className="text-[var(--gkli-primary)]" size={22} /><p className="mt-4 text-sm font-medium text-slate-950">Templates ADM</p><p className="mt-1 text-sm text-slate-500">{templates.length} modelos disponíveis.</p></Card>
        <Card className="p-5"><Sparkles className="text-[var(--gkli-primary)]" size={22} /><p className="mt-4 text-sm font-medium text-slate-950">Cockpit futuro</p><p className="mt-1 text-sm text-slate-500">Base pronta para alertas e SLA.</p></Card>
      </section>
      <Card className="space-y-4">
        <div><h2 className="text-base font-medium text-slate-950">Templates operacionais</h2><p className="mt-1 text-sm text-slate-500">Criados via SQL seed. A edição visual entra na próxima etapa se fizer sentido.</p></div>
        <div className="grid gap-3 md:grid-cols-2">
          {templates.length === 0 ? <p className="text-sm text-slate-500">Nenhum template ADM encontrado. Execute o SQL deste pacote.</p> : templates.map((template) => (
            <div key={template.id} className="rounded-2xl border border-slate-100 p-4"><p className="text-sm font-medium text-slate-950">{template.nome}</p><p className="mt-1 text-xs uppercase tracking-[0.14em] text-slate-400">{tipoLabel(template.tipo)}</p><p className="mt-3 line-clamp-3 text-sm text-slate-600">{template.conteudo}</p></div>
          ))}
        </div>
      </Card>
    </div>
  )
}
