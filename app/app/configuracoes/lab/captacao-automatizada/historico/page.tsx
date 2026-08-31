import { ArrowLeft, CheckCircle2, Filter, TriangleAlert } from 'lucide-react'
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

export default async function HistoricoCaptacaoPage({ searchParams }: Props) {
  const params = await searchParams
  const q = param(params?.q).trim().toLowerCase()
  const status = param(params?.status)
  const competencia = param(params?.competencia)
  const supabase = createAdminClient()
  const { data: base } = await supabase.from('agente_execucoes').select(`
    id, status, origem, competencia, created_at, iniciado_em, finalizado_em, erro_mensagem,
    condominio:condominios(nome, nome_operacional, administradora),
    receita:agente_receitas(nome),
    logs:agente_logs(step, mensagem, nivel, created_at)
  `).eq('origem', 'agenda_mensal').order('created_at', { ascending: false }).limit(200)

  const competencias = [...new Set((base ?? []).map((row: any) => row.competencia).filter(Boolean))].sort().reverse()
  const rows = (base ?? []).filter((row: any) => {
    const condominio: any = row.condominio
    const texto = `${condominio?.nome} ${condominio?.nome_operacional} ${condominio?.administradora} ${row.receita?.nome} ${row.competencia}`.toLowerCase()
    return (!q || texto.includes(q)) && (!status || row.status === status) && (!competencia || row.competencia === competencia)
  })
  const sucessos = (base ?? []).filter((row: any) => row.status === 'sucesso').length
  const falhas = (base ?? []).filter((row: any) => ['falha', 'precisa_intervencao'].includes(row.status)).length
  const filtrosAtivos = Boolean(q || status || competencia)

  return <ListPage>
    <PageHeader eyebrow="Maestro" title="Histórico de execuções" description="Execuções mensais, resultados e mensagens registradas pelo agente." actions={<ButtonLink href="/app/agente-automatico/maestro?aba=agenda" variant="secondary"><ArrowLeft size={16} />Voltar à agenda</ButtonLink>} />
    <ListKpiGrid className="md:grid-cols-2 xl:grid-cols-2">
      <Kpi icon={<CheckCircle2 size={18} />} label="Executados com sucesso" value={sucessos} />
      <Kpi icon={<TriangleAlert size={18} />} label="Executados com erro" value={falhas} />
    </ListKpiGrid>
    <ListPanel>
      <ListPanelHeader>
        <ListTitleBar><ListTitle title="Execuções mensais" description="Histórico dos disparos criados automaticamente pela agenda." /><ClearFiltersLink href="/app/configuracoes/lab/captacao-automatizada/historico" show={filtrosAtivos} /></ListTitleBar>
        <ListFiltersForm className="grid-cols-1 md:grid-cols-2 xl:grid-cols-12">
          <ListSearchField placeholder="Condomínio, administradora ou receita" defaultValue={q} className="xl:col-span-5" />
          <ListFilterField label="Competência" className="xl:col-span-3"><Select name="competencia" defaultValue={competencia}><option value="">Todas</option>{competencias.map((item) => <option key={item} value={item}>{item}</option>)}</Select></ListFilterField>
          <ListFilterField label="Status" className="xl:col-span-3"><Select name="status" defaultValue={status}><option value="">Todos</option><option value="pendente">Pendente</option><option value="em_execucao">Em execução</option><option value="sucesso">Sucesso</option><option value="falha">Falha</option><option value="precisa_intervencao">Precisa intervenção</option></Select></ListFilterField>
          <Button type="submit" className="w-full xl:col-span-1"><Filter size={16} />Filtrar</Button>
        </ListFiltersForm>
      </ListPanelHeader>
      {!rows.length ? <ListEmptyState title="Nenhuma execução encontrada" description="Ajuste os filtros ou aguarde o primeiro disparo da agenda mensal." /> : <ListRows>{rows.map((row: any) => {
        const condominio: any = row.condominio
        const ultimoLog = [...(row.logs ?? [])].sort((a: any, b: any) => String(b.created_at).localeCompare(String(a.created_at)))[0]
        return <ListRow key={row.id} className="xl:grid-cols-[minmax(300px,1.4fr)_130px_170px_180px_minmax(260px,1fr)]">
          <div className="min-w-0"><p className="truncate text-sm font-medium text-slate-950">{condominio?.nome_operacional || condominio?.nome || 'Condomínio não informado'}</p><p className="mt-1 truncate text-xs text-slate-500">{condominio?.administradora || 'Administradora não informada'} · {row.receita?.nome || 'Receita não informada'}</p></div>
          <div><p className="text-xs font-medium uppercase text-slate-400">Competência</p><p className="mt-1 text-sm text-slate-700">{row.competencia || '—'}</p></div>
          <div><p className="text-xs font-medium uppercase text-slate-400">Criada em</p><p className="mt-1 text-sm text-slate-700">{formatarData(row.created_at)}</p></div>
          <div><p className="text-xs font-medium uppercase text-slate-400">Status</p><div className="mt-1"><StatusBadge status={row.status} /></div></div>
          <div className="min-w-0"><p className="text-xs font-medium uppercase text-slate-400">Último registro</p><p className={`mt-1 truncate text-sm ${row.erro_mensagem ? 'text-rose-700' : 'text-slate-600'}`}>{row.erro_mensagem || ultimoLog?.mensagem || 'Execução registrada sem mensagens.'}</p></div>
        </ListRow>
      })}</ListRows>}
    </ListPanel>
  </ListPage>
}

function Kpi({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) { return <Card className="relative overflow-hidden p-3"><div className="absolute right-4 top-3 rounded-lg bg-[var(--gkli-primary-light)] p-2 text-[var(--gkli-primary)]">{icon}</div><p className="text-xs font-medium uppercase text-slate-400">{label}</p><p className="mt-1.5 text-2xl font-semibold text-slate-950">{value}</p></Card> }
