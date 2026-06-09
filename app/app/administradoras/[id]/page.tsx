import Link from 'next/link'
import { AlertTriangle, CheckCircle2, Mail, MessageCircle, Plus, Save, Send, Users } from 'lucide-react'
import { notFound } from 'next/navigation'
import { PageHeader } from '@/components/ui/page-header'
import { Card } from '@/components/ui/card'
import { Button, ButtonLink } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { StatusBadge } from '@/components/data/status-badge'
import { createContatoAdministradora, createSolicitacaoAdm, resolverSolicitacaoAdm, updateAdministradora } from '@/features/administradoras/actions'
import { getAdministradora, getMetricasAdministradora, listCondominiosVinculados, listContatosAdministradora, listSolicitacoesAdministradora } from '@/features/administradoras/queries'

type Props = { params: Promise<{ id: string }> }

function fmtDate(value?: string | null) {
  if (!value) return '-'
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value))
}

function tipoLabel(tipo?: string | null) {
  const map: Record<string, string> = {
    pedido_planilha_debitos: 'Pedido de planilha',
    pedido_boleto_acordo: 'Pedido de boleto',
    registro_acordo_realizado: 'Registro de acordo',
    atualizacao_debito: 'Atualização de débito',
    confirmacao_pagamento: 'Confirmação de pagamento',
    outros: 'Outros',
  }
  return map[String(tipo)] ?? String(tipo ?? '-')
}

export default async function AdministradoraDetalhePage({ params }: Props) {
  const { id } = await params
  const [administradora, contatos, solicitacoes, metricas, condominios] = await Promise.all([
    getAdministradora(id),
    listContatosAdministradora(id),
    listSolicitacoesAdministradora(id),
    getMetricasAdministradora(id),
    listCondominiosVinculados(id),
  ])

  if (!administradora) notFound()

  const abertas = solicitacoes.filter((s) => !['resolvido', 'cancelado'].includes(String(s.status)))
  const timeline = solicitacoes.slice(0, 8)

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Administradoras"
        title={administradora.nome_operacional || administradora.nome}
        description="Hub operacional da relação com a administradora: contatos, solicitações, SLA básico e pendências externas."
        actions={<><ButtonLink href="/app/administradoras" variant="secondary">Voltar</ButtonLink><ButtonLink href="/app/administradoras/solicitacoes" variant="secondary">Solicitações ADM</ButtonLink></>}
      />

      <section className="grid gap-3 md:grid-cols-4">
        <Card className="p-5"><p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">Contatos ativos</p><p className="mt-3 text-3xl font-semibold text-slate-950">{metricas.contatosAtivos}</p><p className="mt-1 text-sm text-slate-500">pessoas mapeadas</p></Card>
        <Card className="p-5"><p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">Solicitações abertas</p><p className="mt-3 text-3xl font-semibold text-slate-950">{metricas.solicitacoesAbertas}</p><p className="mt-1 text-sm text-slate-500">em acompanhamento</p></Card>
        <Card className="p-5"><p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">Atrasadas</p><p className="mt-3 text-3xl font-semibold text-rose-700">{metricas.solicitacoesAtrasadas}</p><p className="mt-1 text-sm text-slate-500">fora do prazo</p></Card>
        <Card className="p-5"><p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">SLA médio</p><p className="mt-3 text-3xl font-semibold text-slate-950">{metricas.tempoMedioRespostaHoras ? `${metricas.tempoMedioRespostaHoras}h` : '-'}</p><p className="mt-1 text-sm text-slate-500">tempo de resposta</p></Card>
      </section>

      <div className="grid gap-5 xl:grid-cols-[1.05fr_.95fr]">
        <Card className="space-y-4">
          <div><h2 className="text-base font-medium text-slate-950">Dados cadastrais</h2><p className="mt-1 text-sm text-slate-500">Cadastro central da administradora.</p></div>
          <form action={updateAdministradora} className="grid gap-4 md:grid-cols-2">
            <input type="hidden" name="id" value={administradora.id} />
            <label className="space-y-1.5"><span className="text-xs font-medium uppercase tracking-[0.14em] text-slate-400">Nome / razão social</span><Input name="nome" defaultValue={administradora.nome} required /></label>
            <label className="space-y-1.5"><span className="text-xs font-medium uppercase tracking-[0.14em] text-slate-400">Nome operacional</span><Input name="nome_operacional" defaultValue={administradora.nome_operacional ?? ''} placeholder="Como a equipe chama no dia a dia" /></label>
            <label className="space-y-1.5"><span className="text-xs font-medium uppercase tracking-[0.14em] text-slate-400">CNPJ *</span><Input name="cnpj" defaultValue={administradora.cnpj ?? ''} required inputMode="numeric" placeholder="00.000.000/0000-00" /></label>
            <label className="space-y-1.5"><span className="text-xs font-medium uppercase tracking-[0.14em] text-slate-400">Status</span><Select name="status" defaultValue={administradora.status ?? 'ativo'}><option value="ativo">Ativo</option><option value="inativo">Inativo</option><option value="suspenso">Suspenso</option></Select></label>
            <label className="space-y-1.5"><span className="text-xs font-medium uppercase tracking-[0.14em] text-slate-400">E-mail</span><Input name="email" defaultValue={administradora.email ?? ''} /></label>
            <label className="space-y-1.5"><span className="text-xs font-medium uppercase tracking-[0.14em] text-slate-400">Telefone</span><Input name="telefone" defaultValue={administradora.telefone ?? ''} /></label>
            <label className="space-y-1.5"><span className="text-xs font-medium uppercase tracking-[0.14em] text-slate-400">Site</span><Input name="site" defaultValue={administradora.site ?? ''} /></label>
            <label className="space-y-1.5"><span className="text-xs font-medium uppercase tracking-[0.14em] text-slate-400">Responsável interno</span><Input name="responsavel_interno" defaultValue={administradora.responsavel_interno ?? ''} /></label>
            <label className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 md:col-span-2">
              <input type="checkbox" name="acesso_gerar_acordo" defaultChecked={Boolean(administradora.acesso_gerar_acordo)} className="mt-1 h-4 w-4 rounded border-slate-300 accent-[var(--gkli-primary)]" />
              <span>
                <span className="block text-sm font-medium text-slate-950">Acesso para gerar acordo</span>
                <span className="mt-1 block text-xs leading-5 text-slate-500">Marque quando esta administradora puder operar ou receber fluxo de geracao de acordo.</span>
              </span>
            </label>
            <label className="space-y-1.5 md:col-span-2"><span className="text-xs font-medium uppercase tracking-[0.14em] text-slate-400">Observações</span><Textarea name="observacoes" defaultValue={administradora.observacoes ?? ''} rows={4} /></label>
            <div className="md:col-span-2"><Button type="submit"><Save size={16} />Salvar alterações</Button></div>
          </form>
        </Card>

        <Card className="space-y-4">
          <div><h2 className="text-base font-medium text-slate-950">Ação rápida</h2><p className="mt-1 text-sm text-slate-500">Abra uma pendência operacional para planilha, boleto ou registro de acordo.</p></div>
          <form action={createSolicitacaoAdm} className="grid gap-3">
            <input type="hidden" name="administradora_id" value={administradora.id} />
            <label className="space-y-1.5"><span className="text-xs font-medium uppercase tracking-[0.14em] text-slate-400">Tipo</span><Select name="tipo" defaultValue="pedido_planilha_debitos"><option value="pedido_planilha_debitos">Pedido de planilha de débitos</option><option value="pedido_boleto_acordo">Pedido de boleto de acordo</option><option value="registro_acordo_realizado">Registro de acordo realizado</option><option value="atualizacao_debito">Atualização de débito</option><option value="confirmacao_pagamento">Confirmação de pagamento</option><option value="outros">Outros</option></Select></label>
            <label className="space-y-1.5"><span className="text-xs font-medium uppercase tracking-[0.14em] text-slate-400">Contato</span><Select name="contato_id" defaultValue=""><option value="">Contato geral</option>{contatos.map((c) => <option key={c.id} value={c.id}>{c.nome} {c.setor ? `· ${c.setor}` : ''}</option>)}</Select></label>
            <label className="space-y-1.5"><span className="text-xs font-medium uppercase tracking-[0.14em] text-slate-400">Assunto</span><Input name="assunto" placeholder="Ex.: Solicitação de boleto do acordo" /></label>
            <label className="space-y-1.5"><span className="text-xs font-medium uppercase tracking-[0.14em] text-slate-400">Prazo de resposta</span><Input name="prazo_resposta" type="datetime-local" /></label>
            <label className="space-y-1.5"><span className="text-xs font-medium uppercase tracking-[0.14em] text-slate-400">Mensagem / observações</span><Textarea name="mensagem" rows={5} placeholder="Descreva o pedido para registro e acompanhamento." /></label>
            <Button type="submit"><Send size={16} />Criar solicitação ADM</Button>
          </form>
        </Card>
      </div>

      <div className="grid gap-5 xl:grid-cols-[1fr_1fr]">
        <Card className="space-y-4">
          <div className="flex items-start justify-between gap-3"><div><h2 className="text-base font-medium text-slate-950">Contatos inline</h2><p className="mt-1 text-sm text-slate-500">Financeiro, cobrança, jurídico, atendimento e diretoria.</p></div><Users className="text-slate-300" /></div>
          <form action={createContatoAdministradora} className="grid gap-3 rounded-2xl border border-slate-100 bg-slate-50 p-4 md:grid-cols-2">
            <input type="hidden" name="administradora_id" value={administradora.id} />
            <Input name="nome" placeholder="Nome do contato" required />
            <Input name="setor" placeholder="Setor" />
            <Input name="email" placeholder="E-mail" />
            <Input name="whatsapp" placeholder="WhatsApp" />
            <label className="flex items-center gap-2 text-sm text-slate-600"><input type="checkbox" name="principal" /> Principal</label>
            <label className="flex items-center gap-2 text-sm text-slate-600"><input type="checkbox" name="recebe_planilha" /> Recebe planilha</label>
            <label className="flex items-center gap-2 text-sm text-slate-600"><input type="checkbox" name="recebe_boleto" /> Recebe boleto</label>
            <label className="flex items-center gap-2 text-sm text-slate-600"><input type="checkbox" name="recebe_cobranca" /> Recebe cobrança</label>
            <div className="md:col-span-2"><Button type="submit" size="sm"><Plus size={15} />Adicionar contato</Button></div>
          </form>
          <div className="divide-y divide-slate-100">
            {contatos.length === 0 ? <p className="text-sm text-slate-500">Nenhum contato cadastrado.</p> : contatos.map((c) => (
              <div key={c.id} className="py-3"><div className="flex items-start justify-between gap-3"><div><p className="text-sm font-medium text-slate-950">{c.nome} {c.principal ? <span className="text-xs text-[var(--gkli-primary)]">· principal</span> : null}</p><p className="mt-1 text-xs text-slate-500">{c.setor ?? '-'} · {c.email ?? '-'} · {c.whatsapp ?? c.telefone ?? '-'}</p></div><div className="flex gap-2 text-slate-400">{c.email ? <Mail size={15} /> : null}{c.whatsapp ? <MessageCircle size={15} /> : null}</div></div></div>
            ))}
          </div>
        </Card>

        <Card className="space-y-4">
          <div><h2 className="text-base font-medium text-slate-950">Timeline operacional</h2><p className="mt-1 text-sm text-slate-500">Últimos movimentos registrados com a administradora.</p></div>
          <div className="space-y-3">
            {timeline.length === 0 ? <p className="text-sm text-slate-500">Nenhuma movimentação registrada.</p> : timeline.map((s) => (
              <div key={s.id} className="rounded-2xl border border-slate-100 p-4"><div className="flex items-start justify-between gap-3"><div><p className="text-sm font-medium text-slate-950">{tipoLabel(s.tipo)}</p><p className="mt-1 text-xs text-slate-500">{s.assunto ?? 'Sem assunto'} · {fmtDate(s.created_at)}</p></div><StatusBadge status={s.status} /></div></div>
            ))}
          </div>
        </Card>
      </div>

      <Card className="space-y-4">
        <div><h2 className="text-base font-medium text-slate-950">Solicitações abertas</h2><p className="mt-1 text-sm text-slate-500">Pendências externas que podem travar cobrança, acordo ou atualização de débito.</p></div>
        <div className="divide-y divide-slate-100">
          {abertas.length === 0 ? <p className="py-3 text-sm text-slate-500">Sem solicitações abertas.</p> : abertas.map((s) => (
            <div key={s.id} className="grid gap-3 py-4 lg:grid-cols-[1fr_160px_170px_120px] lg:items-center">
              <div><p className="text-sm font-medium text-slate-950">{tipoLabel(s.tipo)}</p><p className="mt-1 text-xs text-slate-500">{s.assunto ?? '-'} · Prazo: {fmtDate(s.prazo_resposta)}</p></div>
              <StatusBadge status={s.status} />
              <p className="text-sm text-slate-600">{s.administradora_contatos?.nome ?? 'Contato geral'}</p>
              <form action={resolverSolicitacaoAdm}><input type="hidden" name="id" value={s.id} /><input type="hidden" name="administradora_id" value={administradora.id} /><Button type="submit" size="sm" variant="secondary"><CheckCircle2 size={15} />Resolver</Button></form>
            </div>
          ))}
        </div>
      </Card>

      <Card className="space-y-4">
        <div><h2 className="text-base font-medium text-slate-950">Condomínios vinculados</h2><p className="mt-1 text-sm text-slate-500">Usa o vínculo direto por administradora quando disponível no cadastro de condomínios.</p></div>
        {condominios.length === 0 ? <div className="rounded-2xl border border-dashed border-slate-200 p-5 text-sm text-slate-500"><AlertTriangle size={18} className="mb-2 text-slate-400" />Nenhum condomínio vinculado por administradora_id. Se sua base usa apenas o nome da administradora no condomínio, fazemos a migração de vínculo na próxima etapa.</div> : <div className="grid gap-3 md:grid-cols-2">{condominios.map((c) => <Link key={c.id} href={`/app/condominios/${c.id}`} className="rounded-2xl border border-slate-100 p-4 transition hover:bg-slate-50"><p className="text-sm font-medium text-slate-950">{c.nome}</p><p className="mt-1 text-xs text-slate-500">CNPJ {c.cnpj ?? '-'} · {c.status ?? '-'}</p></Link>)}</div>}
      </Card>
    </div>
  )
}
