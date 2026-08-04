import { CheckCircle2, Clock, Filter, Send } from 'lucide-react'
import Link from 'next/link'
import { PageHeader } from '@/components/ui/page-header'
import { Card } from '@/components/ui/card'
import { ListKpiGrid } from '@/components/layout/list-page'
import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/select'
import { SearchableSelect } from '@/components/ui/searchable-select'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { StatusBadge } from '@/components/data/status-badge'
import { EmptyState } from '@/components/data/empty-state'
import { createSolicitacaoAdm, resolverSolicitacaoAdm } from '@/features/administradoras/actions'
import { listAdministradoras, listSolicitacoesAdministradora } from '@/features/administradoras/queries'

function fmtDate(value?: string | null) {
  if (!value) return '-'
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value))
}
function tipoLabel(tipo?: string | null) {
  const map: Record<string, string> = { pedido_planilha_debitos: 'Pedido de planilha', pedido_boleto_acordo: 'Pedido de boleto', registro_acordo_realizado: 'Registro de acordo', atualizacao_debito: 'Atualização de débito', confirmacao_pagamento: 'Confirmação de pagamento', outros: 'Outros' }
  return map[String(tipo)] ?? String(tipo ?? '-')
}

export default async function SolicitacoesAdmPage() {
  const [rows, administradoras] = await Promise.all([listSolicitacoesAdministradora(), listAdministradoras()])
  const abertas = rows.filter((r) => !['resolvido', 'cancelado'].includes(String(r.status))).length
  const atrasadas = rows.filter((r) => r.prazo_resposta && !['resolvido', 'cancelado'].includes(String(r.status)) && new Date(r.prazo_resposta).getTime() < Date.now()).length

  return (
    <div className="space-y-5">
      <PageHeader eyebrow="Administradoras" title="Solicitações ADM" description="Fila de pedidos de planilha de débitos, boletos de acordo, registros de acordo e retornos externos." />
      <ListKpiGrid className="xl:grid-cols-3">
        <Card className="p-3"><p className="text-xs font-medium uppercase text-slate-400">Solicitações</p><div className="mt-1.5 flex items-end justify-between gap-3"><p className="text-2xl font-semibold text-slate-950">{rows.length}</p><p className="text-sm text-slate-500">registradas</p></div></Card>
        <Card className="p-3"><p className="text-xs font-medium uppercase text-slate-400">Abertas</p><div className="mt-1.5 flex items-end justify-between gap-3"><p className="text-2xl font-semibold text-slate-950">{abertas}</p><p className="text-sm text-slate-500">aguardando retorno</p></div></Card>
        <Card className="p-3"><p className="text-xs font-medium uppercase text-slate-400">Atrasadas</p><div className="mt-1.5 flex items-end justify-between gap-3"><p className="text-2xl font-semibold text-rose-700">{atrasadas}</p><p className="text-sm text-slate-500">fora do prazo</p></div></Card>
      </ListKpiGrid>

      <Card className="space-y-4">
        <div><h2 className="text-base font-medium text-slate-950">Nova solicitação rápida</h2><p className="mt-1 text-sm text-slate-500">Use para testar o fluxo sem entrar no detalhe da administradora.</p></div>
        <form action={createSolicitacaoAdm} className="grid gap-3 lg:grid-cols-4">
          <label className="space-y-1.5"><span className="text-xs font-medium uppercase tracking-[0.14em] text-slate-400">Administradora</span><SearchableSelect name="administradora_id" options={administradoras.map((a) => ({ value: a.id, label: a.nome }))} placeholder="Digite parte da administradora" required /></label>
          <label className="space-y-1.5"><span className="text-xs font-medium uppercase tracking-[0.14em] text-slate-400">Tipo</span><Select name="tipo" defaultValue="pedido_planilha_debitos"><option value="pedido_planilha_debitos">Planilha de débitos</option><option value="pedido_boleto_acordo">Boleto de acordo</option><option value="registro_acordo_realizado">Registro de acordo</option><option value="outros">Outros</option></Select></label>
          <label className="space-y-1.5"><span className="text-xs font-medium uppercase tracking-[0.14em] text-slate-400">Prazo</span><Input name="prazo_resposta" type="datetime-local" /></label>
          <label className="space-y-1.5"><span className="text-xs font-medium uppercase tracking-[0.14em] text-slate-400">Assunto</span><Input name="assunto" /></label>
          <label className="space-y-1.5 lg:col-span-4"><span className="text-xs font-medium uppercase tracking-[0.14em] text-slate-400">Mensagem</span><Textarea name="mensagem" rows={3} /></label>
          <div className="lg:col-span-4"><Button type="submit"><Send size={16} />Criar solicitação</Button></div>
        </form>
      </Card>

      <Card className="overflow-hidden p-0">
        <div className="border-b border-slate-100 px-5 py-4"><h2 className="text-base font-medium text-slate-950">Fila ADM</h2><p className="mt-1 text-sm text-slate-500"><Filter size={14} className="mr-1 inline" />A filtragem avançada entra no próximo refinamento.</p></div>
        {rows.length === 0 ? <div className="p-5"><EmptyState title="Nenhuma solicitação ADM" description="Crie uma solicitação para acompanhar planilhas, boletos e retornos da administradora." /></div> : (
          <div className="divide-y divide-slate-100">
            {rows.map((row) => (
              <div key={row.id} className="grid gap-3 px-5 py-4 lg:grid-cols-[1fr_180px_170px_120px] lg:items-center">
                <div><Link href={`/app/administradoras/${row.administradora_id}`} className="text-sm font-medium text-slate-950 hover:text-[var(--gkli-primary)]">{tipoLabel(row.tipo)} · {row.administradoras?.nome ?? 'Administradora'}</Link><p className="mt-1 text-xs text-slate-500">{row.assunto ?? '-'} · Prazo: {fmtDate(row.prazo_resposta)}</p></div>
                <StatusBadge status={row.status} />
                <p className="text-sm text-slate-600"><Clock size={14} className="mr-1 inline text-slate-400" />{fmtDate(row.created_at)}</p>
                <form action={resolverSolicitacaoAdm}><input type="hidden" name="id" value={row.id} /><input type="hidden" name="administradora_id" value={row.administradora_id} /><Button type="submit" size="sm" variant="secondary"><CheckCircle2 size={15} />Resolver</Button></form>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  )
}
