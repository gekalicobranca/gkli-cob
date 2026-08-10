import Link from 'next/link'
import { Bot, CalendarClock, CheckCircle2, Clock3, Filter, History, Settings2, TriangleAlert } from 'lucide-react'
import { PageHeader } from '@/components/ui/page-header'
import { Card } from '@/components/ui/card'
import { Button, ButtonLink } from '@/components/ui/button'
import { Select } from '@/components/ui/select'
import { StatusBadge } from '@/components/ui/status-badge'
import {
  ClearFiltersLink, ListEmptyState, ListFilterField, ListFiltersForm, ListKpiGrid,
  ListPage, ListPanel, ListPanelHeader, ListRow, ListRows, ListSearchField, ListTitle, ListTitleBar,
} from '@/components/layout/list-page'
import { createAdminClient } from '@/utils/supabase/admin'

export const dynamic = 'force-dynamic'

type Props = { searchParams?: Promise<Record<string, string | string[] | undefined>> }
const param = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] ?? '' : value ?? ''

function formatarData(value?: string | null) {
  if (!value) return '—'
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' }).format(new Date(value))
}

function proximaExecucao(dia?: number | null, horario?: string | null) {
  if (!dia) return null
  const now = new Date()
  const partes = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now).split('-').map(Number)
  let [ano, mes] = partes
  const [hora, minuto] = String(horario ?? '08:00').split(':').map(Number)
  let data = new Date(ano, mes - 1, dia, hora || 0, minuto || 0)
  if (data.getTime() <= now.getTime()) { mes++; if (mes > 12) { mes = 1; ano++ }; data = new Date(ano, mes - 1, dia, hora || 0, minuto || 0) }
  return data
}

export default async function CaptacaoAutomatizadaPage({ searchParams }: Props) {
  const params = await searchParams
  const q = param(params?.q).trim().toLowerCase()
  const administradora = param(params?.administradora)
  const agendaFiltro = param(params?.agenda)
  const supabase = createAdminClient()

  const [{ data: condominiosBase }, { data: conversoes }, { data: execucoesAgenda }] = await Promise.all([
    supabase.from('condominios').select('id, nome, nome_operacional, cnpj, administradora, status, captacao_dia_mes, captacao_horario, carteiras(nome)').eq('captacao_automatica_habilitada', true).order('nome'),
    supabase.from('conversoes_relatorio').select('id, nome_arquivo, status, total_cobrancas, total_parcelas, inconsistencias_json, criado_em, atualizado_em, preview_json').eq('origem', 'captacao_automatizada:bbz').order('criado_em', { ascending: false }).limit(40),
    supabase.from('agente_execucoes').select('id, condominio_id, status, competencia, created_at, erro_mensagem, logs:agente_logs(step, mensagem, nivel, created_at)').eq('origem', 'agenda_mensal').order('created_at', { ascending: false }).limit(40),
  ])

  const administradoras = [...new Set((condominiosBase ?? []).map((row: any) => row.administradora).filter(Boolean))].sort()
  const condominios = (condominiosBase ?? []).filter((row: any) => {
    const texto = `${row.nome} ${row.nome_operacional} ${row.cnpj} ${row.administradora}`.toLowerCase()
    if (q && !texto.includes(q)) return false
    if (administradora && row.administradora !== administradora) return false
    if (agendaFiltro === 'agendada' && !row.captacao_dia_mes) return false
    if (agendaFiltro === 'sem_agenda' && row.captacao_dia_mes) return false
    return true
  })
  const agendados = (condominiosBase ?? []).filter((row: any) => row.captacao_dia_mes).length
  const aguardando = (conversoes ?? []).filter((row: any) => row.status === 'aguardando_validacao').length
  const falhas = (execucoesAgenda ?? []).filter((row: any) => ['falha', 'precisa_intervencao'].includes(row.status)).length
  const filtrosAtivos = Boolean(q || administradora || agendaFiltro)

  return <ListPage>
    <PageHeader eyebrow="Configurações · Lab" title="Captação automatizada" description="Agenda mensal, coleta de relatórios e validação humana antes da importação." actions={<><ButtonLink href="/app/configuracoes/lab/captacao-automatizada/historico" variant="secondary"><History size={16} />Histórico</ButtonLink><ButtonLink href="/app/agente-automatico" variant="secondary"><Bot size={16} />Abrir agente</ButtonLink></>} />

    <ListKpiGrid>
      <Kpi icon={<CheckCircle2 size={18} />} label="Habilitados" value={(condominiosBase ?? []).length} />
      <Kpi icon={<CalendarClock size={18} />} label="Com agenda" value={agendados} />
      <Kpi icon={<Clock3 size={18} />} label="Aguardando validação" value={aguardando} />
      <Kpi icon={<TriangleAlert size={18} />} label="Falhas recentes" value={falhas} />
    </ListKpiGrid>

    <ListPanel>
      <ListPanelHeader>
        <ListTitleBar><ListTitle title="Condomínios habilitados" description="Somente condomínios com captação automática ativada no cadastro." /><ClearFiltersLink href="/app/configuracoes/lab/captacao-automatizada" show={filtrosAtivos} /></ListTitleBar>
        <ListFiltersForm className="grid-cols-1 md:grid-cols-2 xl:grid-cols-12">
          <ListSearchField placeholder="Condomínio, CNPJ ou administradora" defaultValue={q} className="xl:col-span-5" />
          <ListFilterField label="Administradora" className="xl:col-span-3"><Select name="administradora" defaultValue={administradora}><option value="">Todas</option>{administradoras.map((nome) => <option key={nome} value={nome}>{nome}</option>)}</Select></ListFilterField>
          <ListFilterField label="Agenda" className="xl:col-span-3"><Select name="agenda" defaultValue={agendaFiltro}><option value="">Todas</option><option value="agendada">Com agenda</option><option value="sem_agenda">Sem agenda</option></Select></ListFilterField>
          <Button type="submit" className="w-full xl:col-span-1"><Filter size={16} />Filtrar</Button>
        </ListFiltersForm>
      </ListPanelHeader>

      {!condominios.length ? <ListEmptyState title="Nenhum condomínio habilitado" description="Ajuste os filtros ou habilite a captação automática no cadastro do condomínio." /> : <ListRows>{condominios.map((row: any) => {
        const ultimaAgenda: any = (execucoesAgenda ?? []).find((item: any) => item.condominio_id === row.id)
        const ultimaConversao: any = (conversoes ?? []).find((item: any) => item.preview_json?.condominioId === row.id)
        const proxima = proximaExecucao(row.captacao_dia_mes, row.captacao_horario)
        return <ListRow key={row.id} className="xl:grid-cols-[minmax(300px,1.5fr)_180px_190px_180px_190px]">
          <Link href={`/app/condominios/${row.id}#cobranca`} className="min-w-0"><p className="truncate text-sm font-medium text-slate-950 hover:text-[var(--gkli-primary)]">{row.nome_operacional || row.nome}</p><p className="mt-1 truncate text-xs text-slate-500">{row.administradora || 'Administradora não informada'} · CNPJ {row.cnpj || '—'} · {(row.carteiras as any)?.nome || 'Carteira não informada'}</p></Link>
          <div><p className="text-xs font-medium uppercase text-slate-400">Agenda mensal</p><p className="mt-1 text-sm text-slate-700">{row.captacao_dia_mes ? `Dia ${row.captacao_dia_mes} · ${String(row.captacao_horario ?? '08:00').slice(0, 5)}` : 'Não configurada'}</p></div>
          <div><p className="text-xs font-medium uppercase text-slate-400">Próxima execução</p><p className="mt-1 text-sm text-slate-700">{proxima ? formatarData(proxima.toISOString()) : 'Defina dia e horário'}</p></div>
          <div><p className="text-xs font-medium uppercase text-slate-400">Última coleta</p><div className="mt-1">{ultimaAgenda ? <StatusBadge status={ultimaAgenda.status} /> : <span className="text-sm text-slate-500">Sem execução</span>}</div></div>
          <div className="flex flex-wrap justify-start gap-2 xl:justify-end">{ultimaConversao?.status === 'aguardando_validacao' && <ButtonLink size="sm" href={`/app/configuracoes/lab/captacao-automatizada/${ultimaConversao.id}`}>Validar</ButtonLink>}<ButtonLink size="sm" variant="secondary" href={`/app/condominios/${row.id}#cobranca`}><Settings2 size={15} />Configurar</ButtonLink></div>
        </ListRow>
      })}</ListRows>}
    </ListPanel>

  </ListPage>
}

function Kpi({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) { return <Card className="relative overflow-hidden p-3"><div className="absolute right-4 top-3 rounded-lg bg-[var(--gkli-primary-light)] p-2 text-[var(--gkli-primary)]">{icon}</div><p className="text-xs font-medium uppercase text-slate-400">{label}</p><p className="mt-1.5 text-2xl font-semibold text-slate-950">{value}</p></Card> }
